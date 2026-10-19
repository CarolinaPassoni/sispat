import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { getUserByIdentifierDb, upsertUserDb } from '../src/db/dbService.js';
import { hashPasswordNode, validatePasswordStrengthNode } from '../src/db/password.js';

const password = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
const error = validatePasswordStrengthNode(password);
if (error) throw new Error(error);
const account = await getUserByIdentifierDb(process.argv[2] || 'admin');
if (!account || account.role !== 'ADMIN') throw new Error('Administrador não encontrado. Aplique as migrations antes.');
account.passwordHash = hashPasswordNode(password);
account.forcePasswordChange = true;
account.situacao = 'Ativo';
account.tentativasInvalidas = 0;
await upsertUserDb(account);
console.log('Administrador provisionado. Troca de senha obrigatória no próximo acesso.');
process.exit(0);
