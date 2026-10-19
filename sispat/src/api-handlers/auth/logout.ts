import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sessionCookie } from '../../db/session.js';
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  sessionCookie(res, '', 0);
  return res.json({ success: true });
}
