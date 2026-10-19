import type { VercelResponse } from '@vercel/node';
export const SESSION_COOKIE = 'sispat_session';
export function sessionCookie(res: VercelResponse, token: string, maxAge = 43200) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}
export function requestToken(req: { headers: { [key: string]: string | string[] | undefined } }): string {
  const cookie = req.headers.cookie;
  const raw = Array.isArray(cookie) ? cookie[0] : cookie;
  return raw?.split(';').map(v => v.trim()).find(v => v.startsWith(SESSION_COOKIE + '='))?.slice(SESSION_COOKIE.length + 1) || '';
}
