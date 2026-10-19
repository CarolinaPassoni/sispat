import { requestToken } from './session.js';
import { verifyToken, credentialFingerprint } from './jwt.js';
import { can } from './permissions.js';
import type { UserRole } from '../types';

export type AuthorizedUser = {
  id: string;
  login: string;
  role: UserRole;
  nomeCompleto: string;
  situacao: string;
};

export type AuthorizeResult = {
  ok: boolean;
  status?: number;
  error?: string;
  user?: AuthorizedUser;
};

export type AuthorizeOptions = {
  // Exige um role específico (ex.: ADMIN).
  allowPasswordChange?: boolean;
  roles?: UserRole[];
  // Exige uma permissão RBAC (ex.: canDeleteAsset).
  permission?: keyof ReturnType<typeof permissionsShape>;
  // Aceita qualquer uma das permissões listadas (ex.: create OU edit).
  permissions?: Array<keyof ReturnType<typeof permissionsShape>>;
};

// Evita referência cíclica de tipo: deriva as chaves do mapa de permissões.
function permissionsShape() {
  return { canCreateAsset: true, canEditAsset: true, canDeleteAsset: true, canPerformInventory: true, canManageLoans: true, canManageMaintenance: true, canViewAudit: true, canConfigureSystem: true, canExportReports: true, canManageUsers: true } as const;
}

type RequestLike = {
  headers: { [key: string]: string | string[] | undefined };
};

// Guard de autorização usado por TODOS os endpoints sensíveis.
// 1. Valida a assinatura/expiração do JWT;
// 2. Carrega o usuário do banco (Neon) — fonte de verdade;
// 3. Rejeita usuário inexistente, inativo ou bloqueado;
// 4. Valida role/permissão exigida pelo endpoint (role do banco, não do token).
export async function authorize(req: RequestLike, options?: AuthorizeOptions): Promise<AuthorizeResult> {
  const payload = verifyToken(requestToken(req));
  if (!payload || !payload.sub) {
    return { ok: false, status: 401, error: 'Token inválido ou expirado.' };
  }

  try {
    const { isDbAvailable, getUserByIdDb } = await import('./dbService.js');
    if (!(await isDbAvailable())) {
      return { ok: false, status: 503, error: 'PostgreSQL indisponível no momento.' };
    }
    const account = await getUserByIdDb(payload.sub);
    if (!account) {
      return { ok: false, status: 401, error: 'Usuário não encontrado no banco central.' };
    }
    if (account.situacao !== 'Ativo') {
      return { ok: false, status: 403, error: account.situacao === 'Bloqueado'
        ? 'Conta bloqueada por motivos de segurança. Contate o Administrador Geral.'
        : 'Conta inativa. Entre em contato com o Administrador Geral.' };
    }

    if (payload.credential !== credentialFingerprint(account.passwordHash)) {
      return { ok: false, status: 401, error: 'Sessão revogada. Entre novamente.' };
    }
    if (account.forcePasswordChange && !options?.allowPasswordChange) {
      return { ok: false, status: 403, error: 'Altere sua senha antes de continuar.' };
    }

    const role = account.role as UserRole;

    if (options?.roles && !options.roles.includes(role)) {
      return { ok: false, status: 403, error: 'Acesso negado: seu perfil não possui permissão para esta operação.' };
    }

    if (options?.permission) {
      if (!can(role, options.permission)) {
        return { ok: false, status: 403, error: 'Acesso negado: seu perfil não possui permissão para esta operação.' };
      }
    }
    if (options?.permissions && options.permissions.length > 0) {
      if (!options.permissions.some(p => can(role, p))) {
        return { ok: false, status: 403, error: 'Acesso negado: seu perfil não possui permissão para esta operação.' };
      }
    }

    return {
      ok: true,
      user: {
        id: account.id,
        login: account.login,
        role,
        nomeCompleto: account.nomeCompleto,
        situacao: account.situacao,
      },
    };
  } catch (error: any) {
    return { ok: false, status: 500, error: error.message || String(error) };
  }
}
