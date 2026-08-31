import { z } from 'zod';

export const visitorLoginSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  email: z.string().email().max(255).toLowerCase(),
  userAgent: z.string().optional(),
  referrer: z.string().url().or(z.literal('')).optional().nullable(),
});

export const activitySchema = z.object({
  sessionId: z.string().uuid(),
  type: z.enum([
    'login',
    'view_overview',
    'view_dashboard',
    'view_tab',
    'view_section',
    'download',
    'feedback_open',
    'feedback_submit',
    'logout',
  ]),
  target: z.string().max(100).optional(),
  metadata: z.record(z.any()).optional(),
});

export const sessionLogoutSchema = z.object({
  sessionId: z.string().uuid(),
  durationSec: z.number().int().min(0).max(86400),
});

export const feedbackSchema = z.object({
  sessionId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(5000).optional(),
  project: z.enum(['p1', 'p2', 'overview']).optional(),
  section: z.string().max(100).optional(),
});

export const adminLoginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(255),
});

export const contentUpdateSchema = z.object({
  key: z.string().min(1).max(255),
  value: z.string(),
});

export const contentBulkUpdateSchema = z.record(z.string());

export const exportQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  format: z.enum(['csv', 'xlsx']).default('csv'),
  limit: z.coerce.number().int().min(1).max(10000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
});

export const visitorQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().max(255).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const reportGenerateSchema = z.object({
  type: z.enum(['pdf', 'csv', 'xlsx']),
  scope: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    project: z.enum(['p1', 'p2', 'all']).optional(),
  }).optional(),
});

export interface ValidatedBody<T> {
  validatedBody: T;
}

export interface ValidatedQuery<T> {
  validatedQuery: T;
}

export function validateBody<T extends z.ZodSchema>(schema: T) {
  return async (c: any, next: any) => {
    try {
      const body = await c.req.json();

      const validated = schema.parse(body);

      c.set('validatedBody', validated);

      await next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return c.json(
          {
            error: 'Validation failed',
            details: err.errors,
          },
          400
        );
      }

      return c.json(
        {
          error: 'Invalid request body',
        },
        400
      );
    }
  };
}

export function validateQuery<T extends z.ZodSchema>(schema: T) {
  return async (c: any, next: any) => {
    try {
      /*
       * Hono's c.req.query() already returns an object:
       *
       * {
       *   page: "1",
       *   limit: "20"
       * }
       *
       * Do NOT pass it through Object.fromEntries().
       */
      const queryParams = c.req.query();

      const validated = schema.parse(queryParams);

      c.set('validatedQuery', validated);

      await next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return c.json(
          {
            error: 'Invalid query parameters',
            details: err.errors,
          },
          400
        );
      }

      console.error('Query validation failed:', err);

      return c.json(
        {
          error: 'Invalid query parameters',
        },
        400
      );
    }
  };
}

export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}