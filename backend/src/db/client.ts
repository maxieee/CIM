import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: any[]): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  if (env.NODE_ENV === 'development') {
    console.log('DB query', { text: text.slice(0, 100), duration, rows: res.rowCount });
  }
  return res;
}

export async function getClient(): Promise<pg.PoolClient> {
  return pool.connect();
}

export async function closePool(): Promise<void> {
  await pool.end();
}