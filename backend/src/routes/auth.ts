import { Hono } from 'hono';
import { verifyPassword } from '../auth/hash.js';
import { generateAccessToken, generateRefreshToken, hashToken, parseDurationToMs } from '../auth/jwt.js';
import { query } from '../db/client.js';
import { validateBody, adminLoginSchema } from '../utils/validation.js';
import '../types/context.js';

const auth = new Hono();

auth.post('/login', validateBody(adminLoginSchema), async (c) => {
  const { username, password } = c.get('validatedBody') as {
    username: string;
    password: string;
  };

  const res = await query(
    `SELECT id, username, password_hash, role FROM admins WHERE username = $1`,
    [username]
  );

  if (res.rows.length === 0) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const admin = res.rows[0];
  const valid = await verifyPassword(password, admin.password_hash);
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const accessToken = generateAccessToken({
    adminId: admin.id,
    username: admin.username,
    role: admin.role,
  });

  const refreshToken = generateRefreshToken(admin.id);
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + parseDurationToMs('7d'));

  await query(
    `INSERT INTO admin_sessions (admin_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [admin.id, refreshTokenHash, expiresAt]
  );

  await query(
    `UPDATE admins SET last_login_at = now() WHERE id = $1`,
    [admin.id]
  );

  return c.json({
    accessToken,
    refreshToken,
    admin: { id: admin.id, username: admin.username, role: admin.role },
  });
});

auth.post('/refresh', async (c) => {
  const body = await c.req.json();
  const { refreshToken } = body;

  if (!refreshToken) {
    return c.json({ error: 'Refresh token required' }, 400);
  }

  const { adminId } = await import('../auth/jwt.js').then(m => m.verifyRefreshToken(refreshToken));
  const tokenHash = hashToken(refreshToken);

  const sessionRes = await query(
    `SELECT as.id, a.username, a.role
     FROM admin_sessions as
     JOIN admins a ON a.id = as.admin_id
     WHERE as.token_hash = $1 AND as.expires_at > now()`,
    [tokenHash]
  );

  if (sessionRes.rows.length === 0) {
    return c.json({ error: 'Refresh token expired or revoked' }, 401);
  }

  const admin = sessionRes.rows[0];
  const newAccessToken = generateAccessToken({
    adminId: admin.id,
    username: admin.username,
    role: admin.role,
  });

  // Rotate refresh token
  const newRefreshToken = generateRefreshToken(admin.id);
  const newRefreshTokenHash = hashToken(newRefreshToken);
  const newExpiresAt = new Date(Date.now() + parseDurationToMs('7d'));

  await query(
    `UPDATE admin_sessions SET token_hash = $1, expires_at = $2 WHERE id = $3`,
    [newRefreshTokenHash, newExpiresAt, sessionRes.rows[0].id]
  );

  return c.json({
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  });
});

auth.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing token' }, 401);
  }

  const token = authHeader.slice(7);
  const tokenHash = hashToken(token);

  await query(
    `DELETE FROM admin_sessions WHERE token_hash = $1`,
    [tokenHash]
  );

  return c.json({ success: true });
});

export default auth;