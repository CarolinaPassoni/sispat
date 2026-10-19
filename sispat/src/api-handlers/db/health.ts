import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkReadiness } from '../../db/readiness.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  const result = await checkReadiness();
  return res.status(result.ready ? 200 : 503).json({
    status: result.ready ? 'ok' : 'unavailable',
    database: result.database ? 'PostgreSQL Connected' : 'PostgreSQL indisponível',
    schema: result.schema ? 'ok' : 'unavailable',
    hasDatabaseUrl: result.hasDatabaseUrl,
    hasJwtSecret: result.hasJwtSecret,
  });
}
