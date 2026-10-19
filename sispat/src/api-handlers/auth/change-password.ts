import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createToken } from '../../db/jwt.js';
import { sessionCookie } from '../../db/session.js';
import { authorize } from '../../db/authorize.js';
import { validatePasswordStrengthNode, verifyPasswordNode, hashPasswordNode } from '../../db/password.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const auth = await authorize(req, { allowPasswordChange: true });
  if (!auth.ok) return res.status(auth.status ?? 503).json({ error: auth.error });
  if (!auth.user?.id) return res.status(401).json({ error: 'Token inválido.' });

  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password) {
    return res.status(400).json({ error: 'Informe a nova senha.' });
  }

  const strengthError = validatePasswordStrengthNode(password);
  if (strengthError) return res.status(400).json({ error: strengthError });

  try {
    const { isDbAvailable, getUserByIdDb, upsertUserDb } = await import('../../db/dbService.js');
    if (!(await isDbAvailable())) {
      return res.status(503).json({ error: 'PostgreSQL indisponível no momento.' });
    }
    const account = await getUserByIdDb(auth.user!.id);
    if (!account) return res.status(401).json({ error: 'Usuário não encontrado.' });

    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    if (!verifyPasswordNode(currentPassword, account.passwordHash).valid) {
      return res.status(401).json({ error: 'Senha atual incorreta.' });
    }
    if (verifyPasswordNode(password, account.passwordHash).valid) {
      return res.status(400).json({ error: 'A nova senha não pode ser igual à senha atual.' });
    }

    const nextHash = hashPasswordNode(password);
    const issued = createToken({ ...account, passwordHash: nextHash });
    if (!issued) return res.status(503).json({ error: 'Autenticação indisponível.' });
    account.passwordHash = nextHash;
    account.forcePasswordChange = false;
    account.tentativasInvalidas = 0;
    await upsertUserDb(account);

    sessionCookie(res, issued.token);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || String(error) });
  }
}
