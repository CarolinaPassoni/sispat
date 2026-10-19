import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'] });
if (!process.env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL é obrigatória para executar migrations.');

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});

