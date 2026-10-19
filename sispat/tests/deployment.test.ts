import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { getTableColumns } from 'drizzle-orm';
import { users, patrimonios } from '../src/db/schema.js';
import { isDbAvailable, getUserByIdentifierDb, getPatrimoniosPageDb } from '../src/db/dbService.js';
import { authorize } from '../src/db/authorize.js';
import { createToken } from '../src/db/jwt.js';
import health from '../src/api-handlers/db/health.js';
import assets from '../src/api-handlers/db/patrimonios/index.js';
import { apiGetPatrimonios } from '../src/services/apiClient.js';

const oldEnv = { DATABASE_URL: process.env.DATABASE_URL, JWT_SECRET: process.env.JWT_SECRET };
const originalQuery = pg.Pool.prototype.query;
const calls: Array<{ text: string; values: unknown[] }> = [];
let queryRows: (text: string, values: unknown[]) => unknown[] = () => [];
// Transporte substituído: nenhum teste conecta a um banco real.
(pg.Pool.prototype as any).query = async (config: any, values: unknown[] = []) => {
  const text = typeof config === 'string' ? config : config.text;
  calls.push({ text, values });
  return { rows: queryRows(text, values) };
};
after(() => {
  pg.Pool.prototype.query = originalQuery;
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
function setup() {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:1/test';
  process.env.JWT_SECRET = 'test-secret-for-deployment-regressions';
  calls.length = 0;
  queryRows = () => [];
}
function response() {
  return {
    statusCode: 200, body: undefined as any, headers: {} as Record<string, string>,
    setHeader(key: string, value: string) { this.headers[key] = value; },
    status(code: number) { this.statusCode = code; return this; },
    json(body: any) { this.body = body; return this; },
  };
}
function userRow(situacao = 'Ativo', role = 'CONSULTOR') {
  const account: Record<string, unknown> = {
    id: 'usr-test', login: 'teste', nomeCompleto: 'Teste', cpf: '123.456.789-00',
    matricula: '1', email: 'teste@example.invalid', cargo: 'Teste', setor: 'Teste',
    situacao, role, passwordHash: 'unused', forcePasswordChange: false,
    tentativasInvalidas: 0, dataCriacao: '2026-01-01',
  };
  return Object.keys(getTableColumns(users)).map(key => account[key] ?? null);
}
function assetRow(id: string) {
  return Object.keys(getTableColumns(patrimonios)).map(key => key === 'id' ? id : null);
}

test('readiness fails closed when DATABASE_URL or JWT_SECRET is absent', async () => {
  setup();
  delete process.env.DATABASE_URL;
  let res = response();
  await health({ method: 'GET' } as any, res as any);
  assert.equal(res.statusCode, 503);
  assert.equal(calls.length, 0);
  setup();
  delete process.env.JWT_SECRET;
  res = response();
  await health({ method: 'GET' } as any, res as any);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.schema, 'ok');
});

test('readiness distinguishes a missing schema from a reachable database', async () => {
  setup();
  const oldError = console.error;
  console.error = () => {};
  try {
    queryRows = text => {
      if (/from "patrimonios"/.test(text)) throw Object.assign(new Error('private SQL details'), { code: '42P01' });
      return [];
    };
    assert.equal(await isDbAvailable(), true);
    const res = response();
    await health({ method: 'GET' } as any, res as any);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.database, 'PostgreSQL Connected');
    assert.equal(res.body.schema, 'unavailable');
    assert.ok(!JSON.stringify(res.body).includes('private SQL'));
  } finally { console.error = oldError; }
});

test('healthy readiness validates columns without retrieving rows and disables cache', async () => {
  setup();
  const res = response();
  await health({ method: 'GET' } as any, res as any);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(calls.filter(c => c.text.startsWith('select ')).length, 8);
  assert.ok(calls.filter(c => c.text.startsWith('select ')).every(c => c.values.at(-1) === 0));
  const invalid = response();
  await health({ method: 'POST' } as any, invalid as any);
  assert.equal(invalid.statusCode, 405);
});

test('login lookup filters in PostgreSQL using bound parameters and a single row', async () => {
  setup();
  queryRows = () => [userRow()];
  const account = await getUserByIdentifierDb('123.456.789-00');
  assert.equal(account?.id, 'usr-test');
  assert.match(calls[0].text, /where.*regexp_replace/);
  assert.ok(calls[0].values.includes('12345678900'));
  assert.equal(calls[0].values.at(-1), 1);
  assert.ok(!calls[0].text.includes('12345678900'));
});

test('authorization still rejects inactive users and insufficient roles', async () => {
  setup();
  const token = createToken({ id: 'usr-test', login: 'teste', role: 'ADMIN' })!.token;
  const req = { headers: { authorization: `Bearer ${token}` } };
  queryRows = text => text.includes('from "users"') ? [userRow('Bloqueado')] : [];
  assert.equal((await authorize(req)).status, 403);
  queryRows = text => text.includes('from "users"') ? [userRow()] : [];
  assert.equal((await authorize(req, { roles: ['ADMIN'] })).status, 403);
  assert.equal((await authorize(req)).ok, true);
  assert.ok(calls.filter(c => c.text.includes('from "users"')).every(c => /where.*"users"\."id"/.test(c.text)));
});

test('asset pagination uses a stable cursor and the endpoint rejects oversized pages', async () => {
  setup();
  queryRows = text => text.includes('from "patrimonios"') ? [assetRow('b'), assetRow('c'), assetRow('d')] : [];
  const page = await getPatrimoniosPageDb(2, 'a');
  assert.deepEqual(page.patrimonios.map(p => p.id), ['b', 'c']);
  assert.equal(page.nextCursor, 'c');
  assert.match(calls[0].text, /where.*>.*order by.*asc.*limit/);
  assert.deepEqual(calls[0].values, ['a', 3]);
  queryRows = () => [];
  assert.equal((await getPatrimoniosPageDb(2, 'd')).nextCursor, null);
  queryRows = text => text.includes('from "users"') ? [userRow()] : [];
  const token = createToken({ id: 'usr-test', login: 'teste', role: 'CONSULTOR' })!.token;
  const res = response();
  await assets({ method: 'GET', headers: { authorization: `Bearer ${token}` }, query: { limit: '201' } } as any, res as any);
  assert.equal(res.statusCode, 400);
});

test('the interface retrieves all asset pages and never returns a partial list on failure', async () => {
  const oldFetch = globalThis.fetch;
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: () => null } });
  let count = 0;
  globalThis.fetch = (async (url: string) => {
    count++;
    if (count === 1) return { ok: true, json: async () => ({ patrimonios: [{ id: 'a' }], nextCursor: 'a' }) };
    assert.ok(url.includes('cursor=a'));
    return { ok: true, json: async () => ({ patrimonios: [{ id: 'b' }], nextCursor: null }) };
  }) as any;
  try {
    assert.deepEqual((await apiGetPatrimonios()).patrimonios.map(p => p.id), ['a', 'b']);
    count = 0;
    globalThis.fetch = (async () => {
      count++;
      if (count === 1) return { ok: true, json: async () => ({ patrimonios: [{ id: 'a' }], nextCursor: 'a' }) };
      return { ok: false, status: 503, json: async () => ({ error: 'Indisponível' }) };
    }) as any;
    await assert.rejects(apiGetPatrimonios(), /Indisponível/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator);
    else delete (globalThis as any).navigator;
    if (oldStorage) Object.defineProperty(globalThis, 'sessionStorage', oldStorage);
    else delete (globalThis as any).sessionStorage;
  }
});
