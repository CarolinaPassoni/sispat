import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authorize } from '../../db/authorize.js';
import type { UserAccount, UserProfile } from '../../types';

function toUserProfile(account: UserAccount): UserProfile {
  return {
    id: account.id,
    role: account.role,
    name: account.nomeCompleto,
    email: account.email,
    cpf: account.cpf,
    matricula: account.matricula,
    setor: account.setor,
    cargo: account.cargo,
    telefone: account.telefone,
    situacao: account.situacao,
    login: account.login,
    forcePasswordChange: account.forcePasswordChange,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const auth = await authorize(req, { allowPasswordChange: true });
  if (!auth.ok) return res.status(auth.status ?? 503).json({ error: auth.error });
  if (!auth.user?.id) return res.status(401).json({ error: 'Token inválido.' });

  try {
    const { isDbAvailable, getUserByIdDb } = await import('../../db/dbService.js');
    if (!(await isDbAvailable())) {
      return res.status(503).json({ error: 'PostgreSQL indisponível no momento.' });
    }
    const account = await getUserByIdDb(auth.user!.id);
    if (!account || account.situacao !== 'Ativo') {
      return res.status(401).json({ error: 'Sessão inválida ou usuário desativado.' });
    }
    return res.json({ user: toUserProfile(account) });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || String(error) });
  }
}
