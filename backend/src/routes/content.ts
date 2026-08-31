import { Hono } from 'hono';
import { query } from '../db/client.js';
import { requireAdmin, optionalAuth } from '../auth/middleware.js';
import { validateBody, contentBulkUpdateSchema } from '../utils/validation.js';
import '../types/context.js';

const content = new Hono();

// GET /content - Public: get dashboard content overrides
content.get('/', optionalAuth, async (c) => {
  const res = await query(`SELECT key, value FROM dashboard_content`);
  const content: Record<string, string> = {};
  res.rows.forEach(row => {
    content[row.key] = row.value;
  });
  return c.json({ content });
});

// Admin routes
const adminContent = new Hono();
adminContent.use('*', requireAdmin);

// GET /admin/content - Get all content (admin)
adminContent.get('/', async (c) => {
  const res = await query(`SELECT key, value, updated_at FROM dashboard_content ORDER BY key`);
  return c.json({ content: res.rows });
});

// POST /admin/content - Bulk update content
adminContent.post('/', validateBody(contentBulkUpdateSchema), async (c) => {
  const updates = c.get('validatedBody') as Record<string, string>;
  const admin = c.get('admin');

  for (const [key, value] of Object.entries(updates)) {
    await query(
      `INSERT INTO dashboard_content (key, value, updated_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [key, value, admin.adminId]
    );
  }

  return c.json({ success: true, updated: Object.keys(updates).length });
});

// POST /admin/content/reset - Reset all content to defaults
adminContent.post('/reset', async (c) => {
  await query(`DELETE FROM dashboard_content`);
  return c.json({ success: true });
});

export { content, adminContent };