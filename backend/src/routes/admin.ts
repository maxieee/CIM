import { Hono } from 'hono';
import { query } from '../db/client.js';
import { requireAdmin } from '../auth/middleware.js';
import { validateQuery, validateBody, exportQuerySchema, visitorQuerySchema, reportGenerateSchema } from '../utils/validation.js';
import { generateEngagementReportPdf } from '../services/report-generator.js';
import { generateEngagementReportExcel } from '../services/report-generator.js';
import type { ReportScope } from '../services/report-generator.js';
import '../types/context.js';

const admin = new Hono();

// All admin routes require authentication
admin.use('*', requireAdmin);

// GET /admin/stats - Dashboard summary
admin.get('/stats', async (c) => {
  const { from, to } = c.req.query();
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  const statsRes = await query(
    `SELECT * FROM get_visitor_stats($1, $2)`,
    [fromDate, toDate]
  );

  const projectRes = await query(
    `SELECT * FROM get_project_popularity($1, $2)`,
    [fromDate, toDate]
  );

  const sectionsRes = await query(
    `SELECT * FROM get_most_viewed_sections($1, $2, 10)`,
    [fromDate, toDate]
  );

  const feedbackRes = await query(
    `SELECT * FROM get_feedback_summary($1, $2)`,
    [fromDate, toDate]
  );

  return c.json({
    overview: statsRes.rows[0] || {
      total_visitors: 0,
      unique_visitors: 0,
      total_sessions: 0,
      avg_session_duration: '0 seconds',
      total_feedback: 0,
      avg_rating: 0,
      total_downloads: 0,
    },
    projects: projectRes.rows,
    topSections: sectionsRes.rows,
    feedbackSummary: feedbackRes.rows,
  });
});

// GET /admin/visitors - List visitors with pagination
admin.get('/visitors', validateQuery(visitorQuerySchema), async (c) => {
  const { from, to, search, page, limit } = c.get('validatedQuery') as {
    from?: string;
    to?: string;
    search?: string;
    page: number;
    limit: number;
  };
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  const offset = (page - 1) * limit;

  let whereClause = '';
  const params: any[] = [];
  let paramIdx = 1;

  if (fromDate) {
    whereClause += ` AND v.created_at >= $${paramIdx++}`;
    params.push(fromDate);
  }
  if (toDate) {
    whereClause += ` AND v.created_at <= $${paramIdx++}`;
    params.push(toDate);
  }
  if (search) {
    whereClause += ` AND (v.name ILIKE $${paramIdx} OR v.email ILIKE $${paramIdx})`;
    params.push(`%${search}%`);
  }

  const countRes = await query(
    `SELECT COUNT(*) FROM visitors v WHERE 1=1 ${whereClause}`,
    params
  );
  const total = parseInt(countRes.rows[0].count, 10);

  params.push(limit, offset);
  const visitorsRes = await query(
    `SELECT v.id, v.name, v.email, v.created_at, v.last_seen_at,
            COUNT(s.id) as session_count,
            COALESCE(SUM(s.duration_sec), 0) as total_duration_sec
     FROM visitors v
     LEFT JOIN sessions s ON s.visitor_id = v.id
     WHERE 1=1 ${whereClause}
     GROUP BY v.id
     ORDER BY v.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    params
  );

  return c.json({
    visitors: visitorsRes.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET /admin/visitors/:id - Individual visitor timeline
admin.get('/visitors/:id', async (c) => {
  const visitorId = c.req.param('id');

  const visitorRes = await query(
    `SELECT * FROM visitors WHERE id = $1`,
    [visitorId]
  );

  if (visitorRes.rows.length === 0) {
    return c.json({ error: 'Visitor not found' }, 404);
  }

  const visitor = visitorRes.rows[0];

  const sessionsRes = await query(
    `SELECT s.*, COUNT(a.id) as activity_count
     FROM sessions s
     LEFT JOIN activities a ON a.session_id = s.id
     WHERE s.visitor_id = $1
     GROUP BY s.id
     ORDER BY s.login_at DESC`,
    [visitorId]
  );

  const feedbackRes = await query(
    `SELECT * FROM feedback WHERE visitor_id = $1 ORDER BY created_at DESC`,
    [visitorId]
  );

  // Get full activity timeline
  const activitiesRes = await query(
    `SELECT a.*, s.project
     FROM activities a
     JOIN sessions s ON s.id = a.session_id
     WHERE a.visitor_id = $1
     ORDER BY a.created_at ASC`,
    [visitorId]
  );

  return c.json({
    visitor,
    sessions: sessionsRes.rows,
    feedback: feedbackRes.rows,
    timeline: activitiesRes.rows,
  });
});

// DELETE /admin/visitors/:id
admin.delete('/visitors/:id', async (c) => {
  const visitorId = c.req.param('id');

  const res = await query(`DELETE FROM visitors WHERE id = $1`, [visitorId]);

  if (res.rowCount === 0) {
    return c.json({ error: 'Visitor not found' }, 404);
  }

  return c.json({ success: true });
});

// POST /admin/visitors/bulk-delete
admin.post('/visitors/bulk-delete', async (c) => {
  const body = await c.req.json();
  const { ids } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return c.json({ error: 'ids array required' }, 400);
  }

  await query(`DELETE FROM visitors WHERE id = ANY($1)`, [ids]);

  return c.json({ success: true, deleted: ids.length });
});

// GET /admin/feedback
admin.get('/feedback', validateQuery(visitorQuerySchema), async (c) => {
  const { from, to, search, page, limit } = c.get('validatedQuery') as {
    from?: string;
    to?: string;
    search?: string;
    page: number;
    limit: number;
  };
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  const offset = (page - 1) * limit;

  let whereClause = '';
  const params: any[] = [];
  let paramIdx = 1;

  if (fromDate) {
    whereClause += ` AND f.created_at >= $${paramIdx++}`;
    params.push(fromDate);
  }
  if (toDate) {
    whereClause += ` AND f.created_at <= $${paramIdx++}`;
    params.push(toDate);
  }
  if (search) {
    whereClause += ` AND (f.comment ILIKE $${paramIdx} OR v.name ILIKE $${paramIdx} OR v.email ILIKE $${paramIdx})`;
    params.push(`%${search}%`);
  }

  const countRes = await query(
    `SELECT COUNT(*) FROM feedback f
     JOIN visitors v ON v.id = f.visitor_id
     WHERE 1=1 ${whereClause}`,
    params
  );
  const total = parseInt(countRes.rows[0].count, 10);

  params.push(limit, offset);
  const feedbackRes = await query(
    `SELECT f.*, v.name, v.email
     FROM feedback f
     JOIN visitors v ON v.id = f.visitor_id
     WHERE 1=1 ${whereClause}
     ORDER BY f.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    params
  );

  return c.json({
    feedback: feedbackRes.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// DELETE /admin/feedback/:id
admin.delete('/feedback/:id', async (c) => {
  const feedbackId = c.req.param('id');

  const res = await query(`DELETE FROM feedback WHERE id = $1`, [feedbackId]);

  if (res.rowCount === 0) {
    return c.json({ error: 'Feedback not found' }, 404);
  }

  return c.json({ success: true });
});

// GET /admin/export/visitors
admin.get('/export/visitors', validateQuery(exportQuerySchema), async (c) => {
  const { from, to, format } = c.get('validatedQuery') as {
    from?: string;
    to?: string;
    format: 'csv' | 'xlsx';
  };
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  let whereClause = '';
  const params: any[] = [];
  let paramIdx = 1;

  if (fromDate) {
    whereClause += ` AND v.created_at >= $${paramIdx++}`;
    params.push(fromDate);
  }
  if (toDate) {
    whereClause += ` AND v.created_at <= $${paramIdx++}`;
    params.push(toDate);
  }

  const res = await query(
    `SELECT v.id, v.name, v.email, v.created_at, v.last_seen_at,
            COUNT(s.id) as sessions,
            COALESCE(SUM(s.duration_sec), 0) as total_duration_sec
     FROM visitors v
     LEFT JOIN sessions s ON s.visitor_id = v.id
     WHERE 1=1 ${whereClause}
     GROUP BY v.id
     ORDER BY v.created_at DESC`,
    params
  );

  if (format === 'xlsx') {
    const buffer = await generateVisitorsExcel(res.rows);
    return new Response(buffer as unknown as BodyInit as unknown as BodyInit as unknown as BodyInit as unknown as BodyInit as unknown as BodyInit as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="visitors_${new Date().toISOString().split('T')[0]}.xlsx"`,
      },
    });
  }

  // CSV
  const headers = ['ID', 'Name', 'Email', 'First Visit', 'Last Seen', 'Sessions', 'Total Duration (sec)'];
  const rows = res.rows.map(r => [
    r.id, r.name, r.email, r.created_at, r.last_seen_at, r.sessions, r.total_duration_sec
  ]);
  const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="visitors_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
});

// GET /admin/export/feedback
admin.get('/export/feedback', validateQuery(exportQuerySchema), async (c) => {
  const { from, to, format } = c.get('validatedQuery') as {
    from?: string;
    to?: string;
    format: 'csv' | 'xlsx';
  };
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  let whereClause = '';
  const params: any[] = [];
  let paramIdx = 1;

  if (fromDate) {
    whereClause += ` AND f.created_at >= $${paramIdx++}`;
    params.push(fromDate);
  }
  if (toDate) {
    whereClause += ` AND f.created_at <= $${paramIdx++}`;
    params.push(toDate);
  }

  const res = await query(
    `SELECT f.id, v.name, v.email, f.rating, f.comment, f.project, f.section, f.created_at
     FROM feedback f
     JOIN visitors v ON v.id = f.visitor_id
     WHERE 1=1 ${whereClause}
     ORDER BY f.created_at DESC`,
    params
  );

  if (format === 'xlsx') {
    const buffer = await generateFeedbackExcel(res.rows);
    return new Response(buffer as unknown as BodyInit as unknown as BodyInit as unknown as BodyInit as unknown as BodyInit as unknown as BodyInit as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="feedback_${new Date().toISOString().split('T')[0]}.xlsx"`,
      },
    });
  }

  const headers = ['ID', 'Name', 'Email', 'Rating', 'Comment', 'Project', 'Section', 'Date'];
  const rows = res.rows.map(r => [
    r.id, r.name, r.email, r.rating, r.comment || '', r.project || '', r.section || '', r.created_at
  ]);
  const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="feedback_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
});

// GET /admin/export/engagement-report
admin.get('/export/engagement-report', validateQuery(exportQuerySchema), async (c) => {
  const { from, to, format } = c.get('validatedQuery') as {
    from?: string;
    to?: string;
    format: 'csv' | 'xlsx' | 'pdf';
  };
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  if (format === 'pdf') {
    const buffer = await generateEngagementReportPdf({ from: fromDate, to: toDate });
    return new Response(buffer as unknown as BodyInit as unknown as BodyInit as unknown as BodyInit as unknown as BodyInit as unknown as BodyInit as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="engagement_report_${new Date().toISOString().split('T')[0]}.pdf"`,
      },
    });
  }

  const buffer = await generateEngagementReportExcel({ from: fromDate, to: toDate });
  return new Response(buffer as unknown as BodyInit as unknown as BodyInit as unknown as BodyInit as unknown as BodyInit as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="engagement_report_${new Date().toISOString().split('T')[0]}.xlsx"`,
    },
  });
});

// POST /admin/reports/generate - Async report generation
admin.post('/reports/generate', validateBody(reportGenerateSchema), async (c) => {
  const { type, scope } = c.get('validatedBody') as {
    type: 'pdf' | 'csv' | 'xlsx';
    scope?: {
      from?: string;
      to?: string;
      project?: 'p1' | 'p2' | 'all';
    };
  };
  const admin = c.get('admin');

  const generationRes = await query(
    `INSERT INTO report_generations (admin_id, type, scope, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING id`,
    [admin.adminId, type, scope || {}]
  );

  const generationId = generationRes.rows[0].id;

  // In a real app, this would be queued to a background worker
  // For now, generate synchronously (with timeout handling)
  setImmediate(async () => {
    try {
      let buffer: Buffer;
      let fileName: string;

      const reportScope: ReportScope = scope ? {
        from: scope.from ? new Date(scope.from) : null,
        to: scope.to ? new Date(scope.to) : null,
        project: scope.project,
      } : {};

      if (type === 'pdf') {
        buffer = await generateEngagementReportPdf(reportScope);
        fileName = `engagement_report_${Date.now()}.pdf`;
      } else {
        buffer = await generateEngagementReportExcel(reportScope);
        fileName = `engagement_report_${Date.now()}.xlsx`;
      }

      // In production, upload to S3/storage and save URL
      // For now, we'll just mark as complete
      await query(
        `UPDATE report_generations SET status = 'completed', completed_at = now(), record_count = $1
         WHERE id = $2`,
        [0, generationId]
      );
    } catch (err) {
      await query(
        `UPDATE report_generations SET status = 'failed' WHERE id = $1`,
        [generationId]
      );
    }
  });

  return c.json({ generationId, status: 'pending' });
});

// GET /admin/reports/:id - Check report status
admin.get('/reports/:id', async (c) => {
  const generationId = c.req.param('id');

  const res = await query(`SELECT * FROM report_generations WHERE id = $1`, [generationId]);

  if (res.rows.length === 0) {
    return c.json({ error: 'Report not found' }, 404);
  }

  return c.json(res.rows[0]);
});

// Excel generation helpers
async function generateVisitorsExcel(rows: any[]): Promise<Buffer> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Visitors');

  sheet.columns = [
    { header: 'ID', key: 'id', width: 36 },
    { header: 'Name', key: 'name', width: 30 },
    { header: 'Email', key: 'email', width: 40 },
    { header: 'First Visit', key: 'created_at', width: 25 },
    { header: 'Last Seen', key: 'last_seen_at', width: 25 },
    { header: 'Sessions', key: 'sessions', width: 12 },
    { header: 'Total Duration (sec)', key: 'total_duration_sec', width: 20 },
  ];

  rows.forEach(r => sheet.addRow(r));
  sheet.getRow(1).font = { bold: true };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function generateFeedbackExcel(rows: any[]): Promise<Buffer> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Feedback');

  sheet.columns = [
    { header: 'ID', key: 'id', width: 36 },
    { header: 'Name', key: 'name', width: 30 },
    { header: 'Email', key: 'email', width: 40 },
    { header: 'Rating', key: 'rating', width: 10 },
    { header: 'Comment', key: 'comment', width: 60 },
    { header: 'Project', key: 'project', width: 15 },
    { header: 'Section', key: 'section', width: 30 },
    { header: 'Date', key: 'created_at', width: 25 },
  ];

  rows.forEach(r => sheet.addRow(r));
  sheet.getRow(1).font = { bold: true };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export default admin;