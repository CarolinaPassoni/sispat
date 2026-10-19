# Autenticação e atualização segura

A sessão usa cookie HttpOnly, SameSite=Strict, Secure em produção e validade de 12 horas. O navegador não recebe JWT no JSON nem o grava em Web Storage. Chamadas de escrita exigem X-Sispat-Request: 1. Não habilite CORS para origens externas.

As APIs consultam o usuário ativo e as permissões no banco. Contas com force_password_change só podem consultar o próprio perfil e trocar a senha. A troca exige senha atual e força mínima. A troca e a redefinição invalidam todos os tokens anteriores por uma impressão HMAC do hash da senha. A sessão da troca recebe novo cookie. Tokens antigos sem essa impressão deixam de funcionar. Não há migration adicional.

Antes de publicar: configure DATABASE_URL e JWT_SECRET exclusivo e aleatório no servidor. Aplique migrations existentes. O README antigo divulgava uma senha inicial. Em bases existentes, redefina o administrador por um administrador autorizado ou atualize password_hash com hashPasswordNode de uma senha exclusiva, force_password_change=true e situacao=Ativo por acesso administrativo seguro ao banco. Nunca cole senhas em comandos, commits ou logs. A migration inicial agora não instala senha conhecida, portanto uma base nova precisa desse provisionamento seguro antes do primeiro login.

Logout apaga o cookie, mas não mantém lista de revogação por sessão. Uma cópia obtida fora do navegador ainda pode valer até expirar; redefinir a senha revoga todas as cópias. HttpOnly reduz roubo por JavaScript, mas não elimina os efeitos de uma eventual falha XSS.

Validação local usa transporte PostgreSQL simulado. Validar login, troca inicial, logout, bloqueio e permissões no ambiente de homologação com Neon antes de produção.

Para provisionar ou recuperar o administrador, em terminal seguro com DATABASE_URL configurada no ambiente:

```bash
python3 -c 'import getpass,sys; sys.stdout.write(getpass.getpass("Senha temporária exclusiva: "))' | node --import tsx scripts/provision-admin.ts admin
```

O comando recebe a senha sem eco no terminal e não a coloca no histórico. Ele altera somente o administrador indicado e invalida suas sessões antigas. Não execute em outro banco por engano.
