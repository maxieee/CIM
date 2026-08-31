import 'hono';
import type { z } from 'zod';
import type { TokenPayload } from '../auth/jwt.js';

// Extend Hono's context to include our custom keys
declare module 'hono' {
  interface ContextVariableMap {
    validatedBody: z.infer<any>;
    validatedQuery: z.infer<any>;
    admin: TokenPayload;
    visitor: { visitorId: string; sessionId: string };
  }
}

// Type helpers for validated body/query
export type ValidatedBody<T> = T;
export type ValidatedQuery<T> = T;