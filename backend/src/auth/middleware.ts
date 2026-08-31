import { Context, Next } from 'hono';
import { verifyAccessToken, TokenPayload } from './jwt.js';

export interface AuthContext extends Context {
  get(key: 'admin'): TokenPayload | undefined;
  set(key: 'admin', value: TokenPayload): void;
}

/**
 * Require a valid access token.
 *
 * Access tokens are JWTs and are validated cryptographically.
 * Refresh tokens are stored separately and are handled
 * by the refresh/logout flow.
 */
export async function requireAuth(
  c: AuthContext,
  next: Next
): Promise<Response | void> {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json(
      { error: 'Missing or invalid Authorization header' },
      401
    );
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return c.json(
      { error: 'Missing or invalid Authorization header' },
      401
    );
  }

  try {
    const payload = verifyAccessToken(token);

    c.set('admin', payload);

    await next();
  } catch (err) {
    console.error('Access token verification failed:', err);

    return c.json(
      { error: 'Invalid or expired token' },
      401
    );
  }
}

/**
 * Require a valid admin access token.
 *
 * IMPORTANT:
 * Access tokens are JWTs and are NOT looked up in admin_sessions.
 * admin_sessions stores hashed refresh tokens, not access tokens.
 */
export async function requireAdmin(
  c: AuthContext,
  next: Next
): Promise<Response | void> {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json(
      { error: 'Missing or invalid Authorization header' },
      401
    );
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return c.json(
      { error: 'Missing or invalid Authorization header' },
      401
    );
  }

  try {
    const payload = verifyAccessToken(token);

    if (!payload.adminId || !payload.username) {
      return c.json(
        { error: 'Invalid admin token' },
        401
      );
    }

    c.set('admin', payload);

    await next();
  } catch (err) {
    console.error('Admin access token verification failed:', err);

    return c.json(
      { error: 'Invalid or expired token' },
      401
    );
  }
}

/**
 * Optional authentication.
 *
 * If a valid access token exists, attach the admin to the context.
 * If no token or an invalid token exists, continue normally.
 */
export function optionalAuth(
  c: AuthContext,
  next: Next
): Promise<Response | void> {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return next();
  }

  try {
    const payload = verifyAccessToken(token);
    c.set('admin', payload);
  } catch {
    // Optional authentication intentionally ignores invalid tokens.
  }

  return next();
}