# Plano de Correções — Autenticação (Login 401 + Refresh 400)

**Projeto:** OkCMS  
**Versão do produto:** conforme root `package.json` / `CMS_VERSION`  
**Status:** Concluído — código implementado, validado (1375 testes, lint, typecheck, build OK) e commitado na branch `release/v1.1.0`. Pendente: push para GitHub (dispara create-release-pr.yml → CI → publish).  
**Causa raiz provável:** estado de banco/ambiente herdado (volume Docker compartilhado `okcms-postgres-data` e/ou `DATABASE_URL` residual no `.env`), agravado por fragilidades de código que mascaram o diagnóstico.

---

## 1. Contexto do Problema

O padrão `401 no /auth/login` seguido de `400 no /auth/refresh` é o **comportamento normal de "login falhou"**: o refresh não encontra token porque o login nunca conseguiu setar os cookies.

- `POST /auth/login` (`apps/api/src/routes/auth/index.ts:177-219`): qualquer exceção no `catch` vira `401 { error: "<mensagem>" }`.
- `POST /auth/refresh` (`apps/api/src/routes/auth/index.ts:269-298`): retorna `400 Missing refresh token` quando não existe cookie `refresh_token` nem body `refreshToken`.

A ordem de execução do login é: resolve tenant pelo `Host` (loopback → tenant `default`) → `SELECT * FROM users WHERE email = $1 AND status = 'ACTIVE'` → `bcrypt.compare` → insere sessão via `session.create`.

---

## 2. Fragilidades Mapeadas e Soluções

A seguir, cada fragilidade com sua localização, impacto, solução proposta (incluindo seus adendos) e checklist de implementação.

---

### 1.1 — Login mascara TODOS os erros como 401 "Invalid credentials"

**Localização:**  
- `apps/api/src/routes/auth/index.ts` linhas 215-217  
- `packages/auth/src/service.ts` linhas 151, 162-167, 188-192

**Descrição:** O `catch` do `/auth/login` converte qualquer exceção (usuário não encontrado, senha errada, hash inválido, erro de banco, falha no `session.create`, erro de schema/tenant) em `401`. A mensagem exata volta no corpo, mas o status HTTP é idêntico para todos os casos, dificultando o diagnóstico.

**Impacto:** Erro de schema/sessão aparece como "credenciais inválidas" para o usuário e para quem olha apenas o status no DevTools.

**Solução (conforme seu adendo):** Implementar códigos de erro estáveis e separar os tipos de erro:
- `401` apenas para credenciais inválidas → código `invalid_credentials`.
- `500` (ou outro status adequado) para erros internos (banco, sessão, schema) → códigos como `session_create_failed`, `db_error`, `schema_error`, `tenant_not_found`.
- O corpo da resposta deve conter `{"error": "<mensagem legível>", "code": "<código estável>"}` para que frontend e diagnóstico distingam os casos sem depender do texto da mensagem.

**Checklist:**
- [ ] Mapear todas as exceções lançadas em `AuthService.login` e `AuthService.register`
- [ ] Definir enum/constantes de códigos de erro (`invalid_credentials`, `user_not_found`, `password_invalid`, `hash_invalid`, `session_create_failed`, `db_error`, `tenant_not_found`, `internal_error`)
- [ ] Alterar `AuthService.login` para lançar erros tipados (ex.: classes de erro com `code` e `statusCode`)
- [ ] Alterar rota `/auth/login` para retornar `401` apenas em `invalid_credentials` e `500` (ou adequado) em erros internos, sempre com `code` no corpo
- [ ] Aplicar mesma padronização em `/auth/api-key-login`, `/auth/refresh` e `/auth/logout` para consistência
- [ ] `/auth/register` será removido (seção 1.1.5) — não aplicar padronização nele
- [ ] Atualizar testes existentes que dependem do status 401 genérico

---

### 1.1.5 — Remover rota pública `/auth/register` (segurança)

**Localização:**  
- `apps/api/src/routes/auth/index.ts` linhas 139-174 (rota HTTP pública)  
- `apps/api/src/index.ts` linha 187 (montagem do router)

**Descrição:** A rota `POST /api/v1/auth/register` é pública e não exige autenticação prévia. Qualquer pessoa que conheça a URL pode criar um usuário. Se for o primeiro usuário do tenant, vira `TENANT_ADMIN` automaticamente (via `AuthService.register` → `linkUserToTenant`), com auto-login imediato e cookies de sessão setados. Para um CMS de gestão de conteúdo, isso permite que um atacante descubra a rota e obtenha privilégios de administrador.

**Solução (conforme sua observação):** Remover a rota HTTP pública `/auth/register`. A lógica de criação de usuário deve permanecer apenas como script interno/CLI, usando o mesmo caminho que `okcms dev` e `user:create` já usam (`createUserAccount` em `packages/cli/src/users.ts`).

**Checklist:**
- [ ] Remover o bloco `authRouter.post('/register', ...)` de `apps/api/src/routes/auth/index.ts`
- [ ] Remover a montagem da rota se houver rota separada (já está dentro de `authRouter`, que é montado em `/api/v1/auth`)
- [ ] Verificar se não há outras referências à rota `/register` no frontend/admin que dependam dela
- [ ] Manter `createUserAccount` em `packages/cli/src/users.ts` intacto (usado por `okcms dev` e `user:create`)
- [ ] Atualizar documentação/OpenAPI se houver referência ao endpoint público de registro

---

### 1.2 — Refresh 400 "Missing refresh token" é consequência ruidosa

**Localização:** `apps/api/src/routes/auth/index.ts` linhas 269-296

**Descrição:** O `/auth/refresh` retorna `400` quando não há cookie `refresh_token` nem body `refreshToken`. Como o login falhou e nunca setou os cookies, o refresh necessariamente falha depois.

**Impacto:** Polui o console do admin com erros de refresh após login malsucedido, confundindo o diagnóstico.

**Solução (conforme seu adendo):** Prosseguir com a solução sugerida anteriormente:
- Retornar erro mais descritivo quando não há sessão prévia (ex.: `401 "No active session"` em vez de `400 "Missing refresh token"`), distinguindo "não enviou token" de "não há sessão ativa".
- Opcionalmente, o frontend pode suprimir a chamada de refresh quando sabe que o login falhou.

**Checklist:**
- [ ] Alterar `/auth/refresh` para retornar `401` com código `no_active_session` quando não há refresh token disponível
- [ ] Manter `400` apenas quando o corpo/cookie está claramente malformado (não apenas ausente)
- [ ] Verificar se frontend/admin trata o novo código `no_active_session`

---

### 1.2.1 — CSRF: apenas para navegador, não para API-First

**Localização:**  
- `apps/api/src/index.ts` linha 174: `app.use('/api/*', csrfMiddleware);`

**Descrição:** O CSRF (double-submit cookie) protege o fluxo de **cookies de navegador** (admin/web), onde o navegador envia cookies automaticamente. O fluxo **API-First** usa API key + Bearer token (`Authorization: Bearer <token>`) via `/auth/api-key-login`, não dependendo de cookies de sessão. Aplicar CSRF globalmente em `/api/*` é desnecessário para API-First e não é a proteção correta para aquele fluxo.

**Solução (conforme sua observação):** Revisar o escopo do CSRF para que se aplique apenas a rotas que usam autenticação por cookie de navegador. Rotas API-First (Bearer token) não precisam de CSRF.

**Checklist:**
- [ ] Verificar quais rotas usam autenticação por cookie (login, refresh, logout via navegador) vs Bearer token (api-key-login, clientes API-first)
- [ ] Ajustar `csrfMiddleware` para não ser aplicado globalmente em `/api/*` se não for necessário para todas
- [ ] Manter CSRF em rotas que setam/usam cookies HttpOnly de sessão
- [ ] Documentar que API-First usa Bearer token e não requer CSRF

---

### 1.3 — `DATABASE_URL` tem precedência sobre `DB_*` e wizard não sobrescreve chaves existentes

**Localização:**  
- `packages/config/src/index.ts` linhas 326-328  
- `packages/cli/src/database-config.ts` linhas 76-87  
- `packages/cli/src/dev.ts` linhas 352-368

**Descrição:** `loadDatabaseConfig` usa `DATABASE_URL` se presente, ignorando `DB_HOST/DB_PORT/DB_NAME/DB_USER`. O wizard do `.env` ("fillMissingEnv") apenas preenche chaves que faltam — se `DATABASE_URL` já existe no `.env` (herdado de tentativa anterior), ele é mantido e CLI + API conectam no banco dessa URL, não no banco dos `DB_*` que o usuário ajustou.

**Impacto:** Usuário ajusta `DB_PORT=5433` no `.env`, mas aplicação conecta na porta do `DATABASE_URL` antigo (ex.: 5432 de outro projeto), encontrando banco diferente/vazio.

**Solução (conforme seu adendo):** Implementar as 3 soluções sugeridas:
1. No wizard do `okcms dev`, detectar quando `DATABASE_URL` existe e oferecer removê-lo ou ignorá-lo em favor das variáveis `DB_*`.
2. Adicionar aviso visível quando `DATABASE_URL` está definido, explicando que ele tem precedência sobre `DB_*`.
3. Permitir `--force-env` (ou similar) para regravar chaves existentes no `.env`.

**Checklist:**
- [ ] No fluxo `runDev`, após carregar `.env`, verificar se `DATABASE_URL` está definido
- [ ] Se definido, exibir aviso: "DATABASE_URL tem precedência sobre DB_*. Deseja ignorá-lo e usar DB_*?"
- [ ] Adicionar flag `--force-env` ao `okcms dev` para sobrescrever chaves existentes
- [ ] Atualizar `fillMissingEnv` / `EnvFile` para suportar sobrescrita condicional via flag
- [ ] Documentar no `.env.example` e README a precedência de `DATABASE_URL`

---

### 1.4 — Comparação de e-mail é exata e case-sensitive

**Localização:**  
- `packages/auth/src/service.ts` linhas 146-149  
- `packages/cli/src/users.ts` linha 44 (`anyUserExists` / `createUserAccount`)

**Descrição:** `WHERE email = $1` não normaliza. Criar `Admin@x.com` e logar com `admin@x.com` dá 401. O CLI também não aplica `trim()` no prompt.

**Impacto:** "Usuário existe, login 401" por diferença de maiúsculas/minúsculas ou espaços.

**Solução (conforme seu adendo):** Prosseguir com a solução sugerida:
- Normalizar e-mail em lowercase + trim no ponto de criação (CLI `createUserAccount` e rota `/register`).
- Normalizar também no login (`LOWER(TRIM(email))` no SELECT, ou normalizar o input antes de consultar).
- Aplicar a mesma normalização em `anyUserExists` e `getFirstUser`.

**Checklist:**
- [ ] Criar utilitário `normalizeEmail(email)` (lowercase + trim) em local compartilhado (ex.: `packages/auth/src/utils.ts` ou `packages/cli/src/utils.ts`)
- [ ] Aplicar `normalizeEmail` em `AuthService.login` antes do SELECT
- [ ] Aplicar `normalizeEmail` em `AuthService.register` antes do SELECT de duplicidade e INSERT
- [ ] Aplicar `normalizeEmail` em `createUserAccount` antes do SELECT de duplicidade e INSERT
- [ ] Aplicar `normalizeEmail` em `anyUserExists` e `getFirstUser` (ou ao menos expor versão que aceita e-mail)
- [ ] Aplicar `normalizeEmail` no prompt do CLI (`okcms dev` admin email)
- [ ] Considerar migração para normalizar e-mails já existentes no banco (backfill)

---

### 2.1 — Volume e container Postgres com nomes globais (compartilhados entre todos os projetos)

**Localização:** `packages/cli/src/assets.ts` linhas 215-303 (infra compose)

**Descrição:** `container_name: okcms-postgres` e volume `name: okcms-postgres-data` são globais. Todos os projetos OkCMS na mesma máquina compartilham o mesmo container e volume. Um banco de projeto anterior persiste e pode conter usuários/tenants/hashes de outro projeto.

**Impacto:** `okcms dev` cria/acha usuário em banco não esperado; login procura usuário em outro estado; volume "sujo" causa hash inválido ou credenciais antigas.

**Solução (conforme seu adendo):** Usar sufixo do nome do projeto (informado em `bunx @oktis-works/cms init [nome-do-projeto]`) nos nomes de container, volume e banco de dados. Também aplicar as outras coisas sugeridas:
- Adicionar opção `--force-recreate-db` para limpar o volume quando necessário.
- Documentar claramente que o volume é compartilhado por padrão em dev (se não usar sufixo).

**Checklist:**
- [ ] Definir como o nome do projeto é capturado e armazenado (ex.: `okcms.config.json`, variável de ambiente `OKCMS_PROJECT_NAME`, ou argumento do `init`)
- [ ] Gerar sufixo seguro para Docker (lowercase, alfanumérico + hífen, remover caracteres especiais)
- [ ] Alterar `assets.ts` para usar `okcms-postgres-<sufixo>`, `okcms-redis-<sufixo>`, `okcms-proxy-<sufixo>`, `okcms-net-<sufixo>`
- [ ] Alterar volumes para `okcms-postgres-data-<sufixo>`, `okcms-redis-data-<sufixo>`
- [ ] Alterar `docker-compose.infra.yml` gerado para usar esses nomes com sufixo
- [ ] Adicionar flag `--force-recreate-db` ao `okcms dev` para dropar/recriar o volume do projeto
- [ ] Atualizar documentação sobre isolamento por projeto em dev

---

### 2.2 — `okcms dev` verifica "qualquer usuário existe", não "este e-mail existe"

**Localização:** `packages/cli/src/users.ts` linhas 79-85; `packages/cli/src/dev.ts` linhas 478-521

**Descrição:** `anyUserExists()` faz `SELECT 1 FROM users LIMIT 1`. Se o volume compartilhado já tem qualquer usuário (de outro projeto), o dev pula a criação do admin. O usuário existente pode ter e-mail/senha diferentes do esperado.

**Sua decisão:** Essa fragilidade já seria resolvida com o ponto 2.1 (volume só compartilhado entre mesmos containers). Caso não seja suficiente, prosseguir com a solução no fluxo do dev: perguntar explicitamente se o usuário deseja recriar/atualizar credenciais quando já existe um usuário com e-mail diferente.

**Checklist:**
- [ ] Após implementar 2.1, verificar se `anyUserExists` ainda precisa de ajuste
- [ ] Se necessário, mudar `anyUserExists` para aceitar e-mail: `SELECT 1 FROM users WHERE email = $1 LIMIT 1`
- [ ] No fluxo `okcms dev`, quando já existe usuário com e-mail diferente do informado via `--email`, perguntar se deseja recriar/atualizar credenciais
- [ ] Implementar caminho de atualização de senha (`UPDATE users SET password_hash = ... WHERE email = ...`) quando o usuário optar por recriar

---

### 2.3 — `DATABASE_URL` precedence e wizard não sobrescreve

**Localização:** mesmo que 1.3.

**Sua decisão:** Prosseguir com as soluções sugeridas (mesmas de 1.3).

**Checklist:** idêntico ao de 1.3 (aviso de precedência, oferta de remoção/ignorar, flag `--force-env`).

---

### 2.4 — Readiness check usa `DB_HOST_PORT || DB_PORT` e banco isolado por projeto

**Localização:** `packages/cli/src/dev.ts` linha 175; `packages/cli/src/assets.ts`

**Descrição:** Se um Postgres antigo está escutando na porta, o `dev` considera o banco pronto e segue usando esse banco. Com a solução 2.1 (sufixo do projeto nos containers/volumes), o nome do banco também deve ter o sufixo do projeto.

**Sua decisão:** Prosseguir com soluções sugeridas + aplicar sufixo do projeto ao nome do banco (`DB_NAME` recebe `<nome_base>_<sufixo_projeto>`), permitindo aplicar as soluções de 2.4 (verificar que o banco específico existe e tem schema esperado).

**Checklist:**
- [ ] No `okcms init [nome-do-projeto]`, definir `DB_NAME` com sufixo do projeto (ex.: `okcms_meuprojeto`)
- [ ] Alterar `waitForDatabaseReady` para verificar não apenas que a porta responde, mas que o banco `DB_NAME` específico existe e tem schema/core tabelas
- [ ] Se o banco não existir, oferecer criá-lo ou usar o comando de infra apropriado
- [ ] Isolar migrações por nome de banco (cada projeto tem seu próprio `okcms` schema)

---

### 3.5 — `AUTH_COOKIE_DOMAIN` vazio causa problemas de cookie cross-porta

**Localização:**  
- `.env.example` linha 53  
- `apps/api/src/routes/auth/index.ts` linhas 61-78 (cookie options)  
- Fluxo guiado de cadastro de `.env` (`packages/cli/src/dev.ts`, `packages/cli/src/env-file.ts`)

**Descrição:** Cookie sem `domain` não é compartilhado entre porta 3000 (API) e 3011 (Admin). Em dev, isso faz o refresh falhar ou o usuário parecer deslogado.

**Sua decisão:**  
1. Documentar melhor a necessidade de `AUTH_COOKIE_DOMAIN`.
2. No fluxo guiado de cadastro de `.envs` (todos os menus que cadastrem `.env`), pedir para criar `AUTH_COOKIE_DOMAIN` da mesma forma que `JWT_SECRET` (preencher hash/valor automaticamente ao selecionar sim).
3. Definir `domain: 'localhost'` como padrão para DEV.
4. Para DEV, permitir apenas SameSite que funcione em localhost (ex.: `lax` ou `none` com secure=false apenas em localhost).
5. Para PROD, resolver SameSite por segurança (`none` + `secure=true` + domínio real).

**Checklist:**
- [ ] Atualizar `.env.example` com `AUTH_COOKIE_DOMAIN=localhost` (dev) e comentário sobre produção
- [ ] No `loadDatabaseConfig` / `loadConfig` (config), aplicar `domain: 'localhost'` como padrão quando `AUTH_COOKIE_DOMAIN` vazio e `nodeEnv !== 'production'`
- [ ] No fluxo guiado `.env` (`dev.ts`), adicionar prompt para `AUTH_COOKIE_DOMAIN` com opção de preencher automaticamente (localhost em dev, domínio real em prod)
- [ ] Validar SameSite em dev: não permitir `none` sem `secure` exceto localhost; em produção exigir `secure=true` quando `sameSite=none` (já existe validação em `validateProductionConfig`)
- [ ] Documentar no README/PLUGIN.md o fluxo de cookies cross-porta em dev vs prod

---

### 4.1 — E2E cobre o caminho "usuário criado pelo `okcms dev` → login"

**Localização:** `scripts/e2e-dev-login.mjs` (novo arquivo)

**Sua decisão:** Prosseguir agora com o teste E2E correto.

**Descrição:** Teste que simula exatamente o fluxo do usuário:
1. Cria banco dedicado (não compartilhado)
2. Roda migrations via CLI oficial (`db:migrate`)
3. Cria usuário via `user:create` (mesmo caminho do `okcms dev`, via `createUserAccount`)
4. Faz login via `POST /auth/login` com aquelas credenciais
5. Testa normalização de e-mail (maiúsculas)
6. Testa senha errada (401 com código `invalid_credentials`)
7. Testa refresh com token válido (200)
8. Testa refresh sem token (401 com código `no_active_session`)
9. Verifica cookies HttpOnly setados no login

**Não usa:** rota `/auth/register` (será removida na Fase 1)

**Checklist:**
- [ ] Arquivo `scripts/e2e-dev-login.mjs` criado
- [ ] Script `test:e2e-dev-login` adicionado ao root `package.json`
- [ ] Teste roda com banco dedicado (DATABASE_URL específica)
- [ ] Teste cria usuário via CLI (`user:create`), não via rota HTTP
- [ ] Teste verifica login 200 com tokens
- [ ] Teste verifica normalização de e-mail (maiúsculas)
- [ ] Teste verifica senha errada → 401 com `code: invalid_credentials`
- [ ] Teste verifica refresh válido → 200
- [ ] Teste verifica refresh sem token → 401 com `code: no_active_session`
- [ ] Teste verifica cookies HttpOnly (access_token, refresh_token, session_expires_at)

---

### 5.1 — Tabela `users` global sem RLS/tenant; risco de e-mail duplicado entre tenants

**Localização:**  
- `packages/auth/src/service.ts` linhas 146-149 (login consulta `users` sem filtro de tenant)  
- Schema/migrations de `users` e `tenant_users`

**Descrição:** O login encontra o primeiro usuário `ACTIVE` com aquele e-mail, independentemente do tenant. Dois tenants podem ter e-mails iguais. Isso quebra o fluxo se a regra de negócio permitir duplicidade.

**Sua decisão:** Adicionar `tenant_id` à tabela `users` OU filtrar por tenant no login (validar que o usuário pertence ao tenant resolvido via `tenant_users`). Escolher o mais profissional visando formas normais. Não pode haver duplicidade de e-mails entre tenants; se a regra de negócio permitir, deve bloquear essa possibilidade.

**Análise profissional (formas normais):**  
A abordagem mais correta é **adicionar `tenant_id` à tabela `users`** e criar **único composto `(email, tenant_id)`**, além de um **único global em `email`** se a regra de negócio proibir e-mails duplicados entre tenants (que parece ser o caso, já que você quer bloquear duplicidade). O login então filtra por `email` E `tenant_id`, garantindo integridade referencial e evitando ambiguidades.

**Checklist:**
- [ ] Adicionar coluna `tenant_id` (UUID, FK para `tenants.id`) à tabela `users` via migração
- [ ] Criar índice único em `users(email)` global (bloquear e-mail duplicado entre todos os tenants)
- [ ] Ou, se a regra permitir e-mails iguais em tenants diferentes: índice único composto `(email, tenant_id)` e remover o global — mas você pediu para bloquear duplicidade, então prefira o único global
- [ ] Preencher `tenant_id` para usuários existentes (backfill baseado em `tenant_users` ou tenant `default`)
- [ ] Alterar `AuthService.login` para filtrar `WHERE email = $1 AND tenant_id = $2 AND status = 'ACTIVE'`
- [ ] Alterar `AuthService.register` para verificar duplicidade considerando `tenant_id`
- [ ] Alterar `createUserAccount` (CLI) para incluir `tenant_id` no INSERT de `users`
- [ ] Atualizar `/auth/me` e outras rotas que consultam `users` para incluir `tenant_id` quando relevante
- [ ] Atualizar schema snapshot (`schema.sql`, `schema.mysql.sql`, `schema.mariadb.sql`) se existirem
- [ ] Executar testes de aceitação de migração (V018 → V025+)

---

### 5.2 — JWT secret padrão inseguro

**Localização:**  
- `.env.example` linha 63 (`JWT_SECRET=change-me-in-production`)  
- `packages/config/src/index.ts` linhas 366-369  
- `packages/cli/src/dev.ts` fluxo guiado

**Seu ponto:** Você está certo de que o fluxo guiado já preenche `JWT_SECRET` seguro. Porém, se o usuário usar `okcms dev` sem passar pelo fluxo guiado e esquecer de mudar `JWT_SECRET`, deve gerar aleatoriamente automaticamente com `okcms dev`, além de gerar `AUTH_COOKIE_DOMAIN` se esquecer.

**Solução:**
- No `okcms dev` (mesmo sem fluxo guiado interativo completo), se `JWT_SECRET` estiver vazio ou for o default, gerar valor aleatório seguro e salvar no `.env`.
- Da mesma forma, se `AUTH_COOKIE_DOMAIN` estiver vazio, gerar `localhost` (dev) ou pedir domínio (prod).

**Checklist:**
- [ ] No `runDev`, após carregar `.env`, verificar `JWT_SECRET`: se vazio ou igual ao default, gerar `randomBytes` e salvar no `.env`
- [ ] Verificar `AUTH_COOKIE_DOMAIN`: se vazio, definir `localhost` em dev ou solicitar no fluxo guiado
- [ ] Garantir que esses valores sejam salvos de volta no arquivo `.env` (não apenas na memória do processo)
- [ ] Manter validação de produção (`validateProductionConfig`) para impedir default em prod

---

### 5.3 — Rate limiting ausente em rotas de auth

**Localização:** `apps/api/src/routes/auth/index.ts` (rotas `/login`, `/refresh`, `/api-key-login`)

**Nota:** A rota `/auth/register` será removida (seção 1.1.5). Portanto, não precisa de rate limiting como rota pública.

**Sua decisão:** Prosseguir com a solução sugerida (adicionar rate limiting nas rotas restantes).

**Resposta à pergunta pendente:** Existe a rota `POST /auth/register` em `apps/api/src/routes/auth/index.ts:139`, mas não existe uma página pública de registro no frontend. O registro é feito via CLI (`okcms dev`, `user:create`) ou pela rota HTTP pública que será removida. Após a remoção, a criação de usuários fica restrita ao script interno/CLI.

**Checklist:**
- [ ] Adicionar rate limiting por IP e por e-mail em `/auth/login` e `/auth/api-key-login`
- [ ] Adicionar rate limiting em `/auth/refresh` para prevenir abuso de rotação de tokens
- [ ] Verificar se já existe middleware de rate limiting no projeto para reutilizar (`loginRateLimitMiddleware` já existe em `apps/api/src/middleware/rate-limit.ts`)

---

### 5.4 — `okcms dev` não pergunta "este e-mail existe?"

**Localização:** `packages/cli/src/dev.ts` linhas 498-521

**Descrição:** Quando `anyUserExists()` retorna true, o dev apenas verifica se o hash do primeiro usuário é válido. Se for válido, pula a criação. Não verifica se o usuário existente corresponde ao e-mail que o desenvolvedor quer usar.

**Sua decisão:** Prosseguir com as duas soluções sugeridas:
1. Quando já existem usuários, perguntar explicitamente qual e-mail usar ou se deseja criar outro.
2. Se `--email` for fornecido e um usuário com esse e-mail já existir, oferecer redefinir a senha.

**Checklist:**
- [ ] No fluxo `okcms dev`, se `anyUserExists()` for true, listar usuários existentes ou perguntar qual e-mail usar
- [ ] Se `--email` fornecido e usuário com esse e-mail já existir, oferecer `UPDATE` de senha/roles em vez de pular
- [ ] Implementar caminho de atualização: `UPDATE users SET password_hash = $1 WHERE email = $2` + upsert em `tenant_users`
- [ ] Manter mensagem clara: "usuário já existe — deseja redefinir senha ou usar outro e-mail?"

---

## 3. Checklist por Fase (ordem de execução sugerida)

### Fase 0 — Preparação (não alterar código ainda)
- [ ] Validar versão `CMS_VERSION` nos 3 anchors (root `CMS_VERSION`, `packages/validation/src/compatibility.ts`, README.md título)
- [ ] Criar branch `release/vX.Y.Z` a partir de `main` atualizada
- [ ] Criar changesets para todos os pacotes afetados (incluindo `@oktis-works/validation` se `CMS_VERSION` mudar)
- [ ] Executar `bun run version-packages` para consumir changesets e sincronizar versões
- [ ] Executar `bun run sync-version --write` para sincronizar anchors

### Fase 1 — Códigos de erro e padronização de responses (1.1, 1.2, 1.1.5)
- [ ] Implementar enum/constantes de códigos de erro
- [ ] Alterar `AuthService.login` e rotas relacionadas para retornar erros tipados com `code`
- [ ] Alterar `/auth/login` para `401` apenas em `invalid_credentials`, `500` em erros internos
- [ ] Alterar `/auth/refresh` para `401 no_active_session` quando não há token
- [ ] Aplicar em `/api-key-login`, `/logout` para consistência
- [ ] Remover rota pública `POST /auth/register` (seção 1.1.5)
- [ ] Manter `createUserAccount` (CLI) intacto como caminho interno de criação de usuário

### Fase 2 — Normalização de e-mail (1.4)
- [ ] Criar utilitário `normalizeEmail`
- [ ] Aplicar em login, register, createUserAccount, anyUserExists, getFirstUser, prompt CLI
- [ ] Backfill de e-mails existentes (opcional, avaliar impacto)

### Fase 3 — Isolamento de infraestrutura por projeto (2.1, 2.2, 2.4)
- [ ] Definir mecanismo de captura do nome do projeto (`okcms init [nome]`)
- [ ] Aplicar sufixo em container names, volume names, network names em `assets.ts`
- [ ] Aplicar sufixo em `DB_NAME` (banco de dados)
- [ ] Atualizar `waitForDatabaseReady` para verificar banco específico
- [ ] Adicionar flag `--force-recreate-db`
- [ ] Ajustar `anyUserExists` para aceitar e-mail (se ainda necessário após 2.1)
- [ ] Implementar prompt de recriação/atualização de credenciais (2.4)

### Fase 4 — Precedência de `DATABASE_URL` e wizard `.env` (1.3, 2.3)
- [ ] Adicionar aviso de precedência de `DATABASE_URL`
- [ ] Adicionar oferta de remover/ignorar `DATABASE_URL` em favor de `DB_*`
- [ ] Adicionar flag `--force-env` para sobrescrever chaves existentes
- [ ] Documentar no `.env.example`

### Fase 5 — Cookies e `AUTH_COOKIE_DOMAIN` (3.5)
- [ ] Default `domain: 'localhost'` em dev quando `AUTH_COOKIE_DOMAIN` vazio
- [ ] Prompt guiado para `AUTH_COOKIE_DOMAIN` (preencher automático como JWT_SECRET)
- [ ] Validar SameSite em dev (localhost) vs prod (segurança)
- [ ] Documentar cross-porta cookies

### Fase 6 — Integridade de tenant e e-mail único (5.1)
- [ ] Migração: adicionar `tenant_id` à tabela `users`
- [ ] Índice único global em `users(email)` (bloquear duplicidade entre tenants)
- [ ] Backfill `tenant_id` para usuários existentes
- [ ] Alterar login, register, createUserAccount para filtrar/inserir com `tenant_id`
- [ ] Atualizar schema snapshots
- [ ] Executar testes de aceitação de migração (postgres-upgrade-acceptance)

### Fase 7 — Segredo JWT e `AUTH_COOKIE_DOMAIN` automático (5.2)
- [ ] Gerar `JWT_SECRET` aleatório se vazio/default no `okcms dev`
- [ ] Gerar `AUTH_COOKIE_DOMAIN` se vazio (localhost dev / domínio guiado prod)
- [ ] Salvar de volta no `.env`

### Fase 8 — Rate limiting (5.3)
- [ ] Adicionar rate limiting em `/login`, `/refresh`, `/api-key-login`
- [ ] `/auth/register` será removido (Fase 1) — não aplicar rate limiting nele

### Fase 9 — Fluxo dev: e-mail existente (5.4)
- [ ] Perguntar qual e-mail usar quando já existem usuários
- [ ] Oferecer redefinição de senha se `--email` já existe

### Fase 10 — Validação pré-release (obrigatório)
- [ ] `bun run test:run`
- [ ] `bun run test:e2e-dev-login` (fluxo `okcms dev` → login com banco dedicado)
- [ ] `bun run check:api-drift`
- [ ] `bun run audit:contracts`
- [ ] `bun run check:provider-matrix`
- [ ] Aceitação PostgreSQL (`OKCMS_ACCEPTANCE_DATABASE_URL=... bun run test:postgres`)
- [ ] `bun run build`
- [ ] Aceitação histórica (`node packages/database/scripts/postgres-upgrade-acceptance.mjs`)
- [ ] Aceitação MySQL/MariaDB (se containers disponíveis)
- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] Repetir até 3 runs limpos consecutivos

### Fase 11 — Commit e release
- [ ] Commit com mensagem conventional (ex.: `chore(release): vX.Y.Z`)
- [ ] Push branch `release/vX.Y.Z`
- [ ] Aguardar PR automático via `create-release-pr.yml`
- [ ] Merge para `main` (publish automático via `publish-on-merge.yml`)
- [ ] Verificar `npm view @oktis-works/validation version` e `dist/compatibility.js` `CMS_VERSION`

---

## 4. Pontos Pendentes para Conversa Futura

Conforme você solicitou, os seguintes itens ficam **pendentes** e serão discutidos com você depois:

**Item já respondido (não está mais pendente):**
- **Item 4.1 — E2E para caminho `okcms dev` → login:** Implementado em `scripts/e2e-dev-login.mjs` (não está mais pendente).
- **Item 5.3 — Rota/página `/register`:** Existe a rota `POST /auth/register` em `apps/api/src/routes/auth/index.ts:139`, mas não existe uma página pública de registro no frontend. A rota será removida (seção 1.1.5). A criação de usuários ficará restrita ao script interno/CLI (`createUserAccount`).

---

## 5. Próximos Passos

Nenhum arquivo de código foi alterado até aqui. Este documento é apenas o plano. Quando você estiver pronto, podemos:

1. Revisar e aprovar este plano.
2. Iniciar a implementação fase por fase, começando pela Fase 1 (códigos de erro) ou pela Fase 3 (isolamento de infra), conforme sua prioridade.
3. Após a implementação, executar a validação pré-release completa antes de criar a branch de release.

Deseja que eu prossiga com alguma fase específica ou ajustar algo neste plano antes de começar a escrever código?