import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { serve } from '@hono/node-server';
import { env } from './config/env.js';
import { closePool } from './db/client.js';
import auth from './routes/auth.js';
import visitors from './routes/visitors.js';
import admin from './routes/admin.js';
import { content, adminContent } from './routes/content.js';

const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', secureHeaders());
app.use(
  '*',
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  })
);

// Simple rate limiting using in-memory store
const visitorStore = new Map<
  string,
  { count: number; resetTime: number }
>();

const adminStore = new Map<
  string,
  { count: number; resetTime: number }
>();

const visitorLimiter = async (c: any, next: any) => {
  const key =
    c.req.header('x-forwarded-for') ||
    c.req.header('x-real-ip') ||
    'unknown';

  const now = Date.now();
  const record = visitorStore.get(key);

  if (!record || now > record.resetTime) {
    visitorStore.set(key, {
      count: 1,
      resetTime: now + 60000,
    });
  } else if (record.count >= 30) {
    return c.json({ error: 'Rate limit exceeded' }, 429);
  } else {
    record.count++;
  }

  await next();
};

const adminLimiter = async (c: any, next: any) => {
  const key =
    c.get('admin')?.adminId ||
    c.req.header('x-forwarded-for') ||
    'unknown';

  const now = Date.now();
  const record = adminStore.get(key);

  if (!record || now > record.resetTime) {
    adminStore.set(key, {
      count: 1,
      resetTime: now + 60000,
    });
  } else if (record.count >= 100) {
    return c.json({ error: 'Rate limit exceeded' }, 429);
  } else {
    record.count++;
  }

  await next();
};

// Health check
app.get('/health', (c) =>
  c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
);

// Public routes
app.use('/api/*', visitorLimiter);

app.route('/api/auth', auth);
app.route('/api/visitors', visitors);
app.route('/api/content', content);

// Admin routes
const adminRoutes = new Hono();

adminRoutes.use('*', adminLimiter);
adminRoutes.route('/auth', auth);
adminRoutes.route('/admin', admin);
adminRoutes.route('/admin/content', adminContent);

app.route('/api', adminRoutes);

// 404 handler
app.notFound((c) =>
  c.json(
    {
      error: 'Not found',
    },
    404
  )
);

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err);

  return c.json(
    {
      error: 'Internal server error',
    },
    500
  );
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await closePool();
  process.exit(0);
});

// Start local Node server
serve({
  fetch: app.fetch,
  port: env.PORT,
  hostname: '0.0.0.0',
}, (info) => {
  console.log(`Server running on http://${info.address}:${info.port}`);
});

// IMPORTANT:
// Netlify Functions imports the Hono app as the default export.
export default app;