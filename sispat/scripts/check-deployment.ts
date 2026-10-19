import dotenv from 'dotenv';
import { checkReadiness } from '../src/db/readiness.js';

dotenv.config({ path: ['.env.local', '.env'] });
const result = await checkReadiness();
console.log(JSON.stringify(result, null, 2));
if (!result.hasDatabaseUrl) console.error('Configure DATABASE_URL para o banco de destino.');
if (!result.hasJwtSecret) console.error('Configure JWT_SECRET no servidor.');
if (result.database && !result.schema) console.error('Confira a estrutura e aplique as migrations pendentes com npm run db:migrate, após backup.');
process.exitCode = result.ready ? 0 : 1;
