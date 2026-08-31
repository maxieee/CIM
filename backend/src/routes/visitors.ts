import { Hono } from 'hono';
import { z } from 'zod';
import { query } from '../db/client.js';
import { validateBody, visitorLoginSchema, activitySchema, sessionLogoutSchema } from '../utils/validation.js';
import crypto from 'crypto';
import '../types/context.js';

const visitors = new Hono();

// Hash IP for privacy
function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex');
}

// Get client IP
function getClientIp(c: any): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
         c.req.header('x-real-ip') ||
         'unknown';
}

const feedbackSchema = z.object({
  sessionId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(5000).optional(),
  project: z.enum(['p1', 'p2', 'overview']).optional(),
  section: z.string().max(100).optional(),
});

const downloadSchema = z.object({
  sessionId: z.string().uuid(),
  reportName: z.string().max(100),
});

// POST /visitors - Create visitor and session on login
visitors.post('/', validateBody(visitorLoginSchema), async (c) => {
  const { name, email, userAgent, referrer } = c.get('validatedBody') as {
    name: string;
    email: string;
    userAgent?: string;
    referrer?: string | null;
  };
  const ip = getClientIp(c);
  const ipHash = hashIp(ip);

  // Check if visitor exists (by email)
  let visitorRes = await query(
    `SELECT id, session_id FROM visitors WHERE email = $1 ORDER BY created_at DESC LIMIT 1`,
    [email]
  );

  let visitorId: string;
  let isNewVisitor = false;

  if (visitorRes.rows.length > 0) {
    visitorId = visitorRes.rows[0].id;
    // Update last seen
    await query(
      `UPDATE visitors SET last_seen_at = now(), user_agent = COALESCE($1, user_agent)
       WHERE id = $2`,
      [userAgent, visitorId]
    );
  } else {
    isNewVisitor = true;
    visitorRes = await query(
      `INSERT INTO visitors (name, email, user_agent, ip_hash, referrer)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, session_id`,
      [name, email, userAgent, ipHash, referrer]
    );
    visitorId = visitorRes.rows[0].id;
  }

  // Create new session
  const sessionRes = await query(
    `INSERT INTO sessions (visitor_id, project, device_info)
     VALUES ($1, 'overview', $2)
     RETURNING id`,
    [visitorId, { userAgent, ipHash }]
  );
  const sessionId = sessionRes.rows[0].id;

  // Log login activity
  await query(
    `INSERT INTO activities (session_id, visitor_id, type, target, metadata)
     VALUES ($1, $2, 'login', 'overview', $3)`,
    [sessionId, visitorId, { isNewVisitor, referrer }]
  );

  return c.json({
    visitorId,
    sessionId,
    isNewVisitor,
  });
});

// POST /sessions/:id/activity - Log activity
visitors.post('/sessions/:id/activity', validateBody(activitySchema), async (c) => {
  const sessionId = c.req.param('id');
  const { type, target, metadata } = c.get('validatedBody') as {
    type: string;
    target?: string;
    metadata?: Record<string, any>;
  };

  // Verify session exists and is active
  const sessionRes = await query(
    `SELECT visitor_id FROM sessions WHERE id = $1 AND is_active = true`,
    [sessionId]
  );

  if (sessionRes.rows.length === 0) {
    return c.json({ error: 'Session not found or inactive' }, 404);
  }

  const visitorId = sessionRes.rows[0].visitor_id;

  await query(
    `INSERT INTO activities (session_id, visitor_id, type, target, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [sessionId, visitorId, type, target, metadata]
  );

  // Update session project if viewing dashboard
  if (type === 'view_dashboard' && metadata?.project) {
    await query(
      `UPDATE sessions SET project = $1 WHERE id = $2`,
      [metadata.project, sessionId]
    );
  }

  // Update visitor last_seen_at periodically
  await query(
    `UPDATE visitors SET last_seen_at = now() WHERE id = $1`,
    [visitorId]
  );

  return c.json({ success: true });
});

// POST /sessions/:id/logout - End session
visitors.post('/sessions/:id/logout', validateBody(sessionLogoutSchema), async (c) => {
  const sessionId = c.req.param('id');
  const { durationSec } = c.get('validatedBody') as {
    durationSec: number;
  };

  const sessionRes = await query(
    `SELECT visitor_id FROM sessions WHERE id = $1 AND is_active = true`,
    [sessionId]
  );

  if (sessionRes.rows.length === 0) {
    return c.json({ error: 'Session not found or already ended' }, 404);
  }

  const visitorId = sessionRes.rows[0].visitor_id;

  await query(
    `UPDATE sessions
     SET logout_at = now(), duration_sec = $1, is_active = false
     WHERE id = $2`,
    [durationSec, sessionId]
  );

  await query(
    `INSERT INTO activities (session_id, visitor_id, type, metadata)
     VALUES ($1, $2, 'logout', $3)`,
    [sessionId, visitorId, { durationSec }]
  );

  return c.json({ success: true });
});

// POST /feedback - Submit feedback
visitors.post('/feedback', validateBody(feedbackSchema), async (c) => {
  const { sessionId, rating, comment, project, section } = c.get('validatedBody') as {
    sessionId: string;
    rating: number;
    comment?: string;
    project?: string;
    section?: string;
  };

  const sessionRes = await query(
    `SELECT visitor_id FROM sessions WHERE id = $1`,
    [sessionId]
  );

  if (sessionRes.rows.length === 0) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const visitorId = sessionRes.rows[0].visitor_id;

  await query(
    `INSERT INTO feedback (visitor_id, session_id, rating, comment, project, section)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [visitorId, sessionId, rating, comment, project, section]
  );

  await query(
    `INSERT INTO activities (session_id, visitor_id, type, target, metadata)
     VALUES ($1, $2, 'feedback_submit', $3, $4)`,
    [sessionId, visitorId, section, { rating, commentLength: comment?.length || 0 }]
  );

  return c.json({ success: true });
});

// POST /download - Track report download
visitors.post('/download', validateBody(downloadSchema), async (c) => {
  const { sessionId, reportName } = c.get('validatedBody') as {
    sessionId: string;
    reportName: string;
  };

  const sessionRes = await query(
    `SELECT visitor_id FROM sessions WHERE id = $1`,
    [sessionId]
  );

  if (sessionRes.rows.length === 0) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const visitorId = sessionRes.rows[0].visitor_id;

  await query(
    `INSERT INTO activities (session_id, visitor_id, type, target, metadata)
     VALUES ($1, $2, 'download', $3, $4)`,
    [sessionId, visitorId, reportName, { reportName }]
  );

  return c.json({ success: true });
});

export default visitors;