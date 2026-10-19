import { sql } from 'drizzle-orm';
import { db } from './index.js';
import { patrimonios, users, sectors, movimentacoes, emprestimos, manutencoes, inventarios, auditLogs } from './schema.js';

// LIMIT 0 valida tabelas e colunas sem carregar dados pessoais.
export async function checkReadiness() {
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
  const hasJwtSecret = Boolean(process.env.JWT_SECRET?.trim());
  if (!hasDatabaseUrl) return { ready: false, database: false, schema: false, hasDatabaseUrl, hasJwtSecret };
  let database = false;
  try {
    await db.execute(sql`SELECT 1`);
    database = true;
    for (const table of [patrimonios, users, sectors, movimentacoes, emprestimos, manutencoes, inventarios, auditLogs]) {
      await db.select().from(table).limit(0);
    }
    return { ready: hasJwtSecret, database: true, schema: true, hasDatabaseUrl, hasJwtSecret };
  } catch (error) {
    console.error('SISPAT readiness check failed:', error);
    return { ready: false, database, schema: false, hasDatabaseUrl, hasJwtSecret };
  }
}
