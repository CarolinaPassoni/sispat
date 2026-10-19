# Deploy do SISPAT Public na Vercel

A interface React/Vite e a API em `api/index.ts` usam PostgreSQL/Neon como banco central. O `server.ts` atende somente o ambiente local/desktop.

## Configuração obrigatória

- Framework: Vite; Build Command: `npm run build`; Output Directory: `dist`.
- Cadastre `DATABASE_URL` e `JWT_SECRET` em Settings > Environment Variables, nos ambientes necessários. Não use prefixo `VITE_` para segredos.
- No Neon, use a URL de conexão com pooling para a aplicação. Mantenha a configuração TLS fornecida pelo Neon.
- Use um segredo JWT aleatório e exclusivo. Gere localmente com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` e cadastre diretamente na Vercel.
- Previews devem usar um banco/branch Neon separado da produção e outro segredo JWT.
- Alterações de variáveis exigem um novo deploy. Confira o repositório, a branch e o commit que realmente serão publicados.

## Banco e migrations

Criar o banco Neon não cria as tabelas. O build não aplica migrations automaticamente.

1. Faça backup do banco existente e confirme o destino antes de qualquer alteração.
2. Em um ambiente autorizado, configure `DATABASE_URL` com a conexão de migration do banco correto. Para execução local, `.env.local` e `.env` são carregados. Não publique esses arquivos.
3. Execute `npm ci`, `npm run lint`, `npm run test:deployment` e `npm run build`.
4. Execute `npm run deploy:check`: ele apenas testa conexão, tabelas/colunas e presença das variáveis, sem alterar dados.
5. Se houver migrations pendentes, execute `npm run db:migrate`. Não use `db:push` como reparo automático em produção. Se já houver tabelas sem histórico Drizzle, concilie a estrutura e o histórico antes de migrar.
6. Repita `npm run deploy:check`. A primeira migration de usuários cadastra o administrador inicial; troque a senha inicial imediatamente.

## Verificação após publicar

- `GET /api/db/health` deve retornar HTTP 200, `status: ok` e `schema: ok`. Banco, estrutura ou variável obrigatória ausente retornam HTTP 503. A resposta não inclui credenciais nem detalhes SQL; consulte os logs internos.
- Verifique login, listagem e edição com conta de teste. Confirme que o usuário sem permissão continua bloqueado.
- A listagem `/api/db/patrimonios` usa `limit` (1 a 200, padrão 100) e `cursor`. A interface busca todas as páginas. Consumidores externos precisam seguir `nextCursor` até `null`.
- A paginação não é um snapshot: alterações simultâneas podem exigir atualizar a lista. A interface ainda mantém os registros carregados em memória.
- Monitore falhas e latência antes de liberar aos usuários.
