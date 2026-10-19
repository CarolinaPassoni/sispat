import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const globalForDb = globalThis as unknown as {
  __sispatPool?: pg.Pool;
  __sispatDb?: ReturnType<typeof createDrizzle>;
};

function createDrizzle(pool: pg.Pool) {
  return drizzle(pool, { schema });
}

// pg may override the ssl object when sslmode is present in the URL.
// Enforce certificate verification in production even for legacy sslmode=require URLs.
export function databaseConnectionString(value: string): string {
  if (process.env.NODE_ENV !== 'production') return value;
  const url = new URL(value);
  for (const key of ['sslmode', 'uselibpqcompat']) url.searchParams.delete(key);
  return url.toString();
}

export function getDb(): ReturnType<typeof createDrizzle> {
  if (!globalForDb.__sispatDb) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not defined');
    }
    // Reutiliza o mesmo Pool entre invocações serverless (Vercel) para
    // evitar exaustão de conexões no PostgreSQL.
    if (!globalForDb.__sispatPool) {
      globalForDb.__sispatPool = new pg.Pool({
        connectionString: databaseConnectionString(process.env.DATABASE_URL),
        max: 3,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 10000,
        query_timeout: 10000,
        allowExitOnIdle: true,
        ssl: process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: true }
          : false,
      });
    }
    globalForDb.__sispatDb = createDrizzle(globalForDb.__sispatPool);
  }
  return globalForDb.__sispatDb;
}

export const db = new Proxy({} as any, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  }
});


