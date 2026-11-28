# Plano de Remoção — Suporte a MySQL e MariaDB

**Projeto:** OkCMS  
**Versão do produto:** conforme root `package.json` / `CMS_VERSION`  
**Status:** Planejamento (nenhum código alterado ainda)  
**Decisão:** Remover suporte a MySQL 8.0.36+ e MariaDB 11.4+; manter apenas PostgreSQL como provedor de banco de dados.

---

## 1. Justificativa para a remoção

O modelo de segurança do OkCMS é baseado em **Row Level Security (RLS) nativo do PostgreSQL**, com `FORCE ROW LEVEL SECURITY` em dezenas de tabelas e políticas como `tenant_id = current_setting('app.current_tenant_id', true)::uuid`. MySQL e MariaDB **não possuem RLS nativo**. O `translateProviderSql()` em `packages/database/src/connection.ts` apenas remove ou neutraliza comandos RLS (linhas 172-175), deixando o isolamento de tenant depender exclusivamente de filtros `WHERE tenant_id = ?` escritos manualmente em cada query da aplicação. Qualquer omissão resulta em vazamento direto de dados entre tenants.

Além disso, manter três provedores implica:
- Três snapshots de schema (`schema.sql`, `schema.mysql.sql`, `schema.mariadb.sql`)
- Três conjuntos de migrações (25+ arquivos cada em `migrations/mysql/`, `migrations/mariadb/`)
- Código de tradução SQL com 50+ regras em `translateProviderSql()`
- Testes de aceitação em CI com containers separados para cada provedor
- Duas dependências npm extras (`mysql2`, `mariadb`)

A remoção simplifica a base de código, elimina o risco de vazamento entre tenants em não-Postgres, reduz o CI e foca o projeto no provedor onde o modelo de segurança (RLS) é garantido pelo banco.

---

## 2. Resumo do impacto

| Categoria | Quantidade aproximada |
|---|---|
| Arquivos de migração MySQL para deletar | 31 |
| Arquivos de migração MariaDB para deletar | 31 |
| Arquivos de schema provider-specific para deletar | 2 |
| Arquivos de compose infra provider-specific | 2 |
| Scripts de geração/provider a remover ou ajustar | 4 |
| Scripts de teste/aceitação a ajustar | 3 |
| Workflows CI a ajustar | 1 |
| Documentação (docs/, READMEs, AGENTS.md) a ajustar | 6+ |
| Dependências npm a remover | 2 (`mysql2`, `mariadb`) |
| Testes unitários a remover ou ajustar | vários |

---

## 3. Arquivos para DELETAR

### 3.1 Migrações MySQL (`migrations/mysql/`)
Deletar todos os 31 arquivos:
- `migrations/mysql/V001__core__add_core_fields_support.sql`
- `migrations/mysql/V002__core__create_field_values_table.sql`
- `migrations/mysql/V003__core__seed_default_content_types.sql`
- `migrations/mysql/V004__core__seed_default_field_groups.sql`
- `migrations/mysql/V005__core__add_user_locale.sql`
- `migrations/mysql/V006__core__expand_media_metadata.sql`
- `migrations/mysql/V007__core__expand_menus.sql`
- `migrations/mysql/V008__core__harden_theme_tenant_rls.sql`
- `migrations/mysql/V009__core__fix_page_type_labels_english.sql`
- `migrations/mysql/V010__core__harden_themes_lifecycle.sql`
- `migrations/mysql/V011__core__plugin_tenants.sql`
- `migrations/mysql/V012__core__api_keys.sql`
- `migrations/mysql/V013__core__field_type_extensions.sql`
- `migrations/mysql/V014__core__comments.sql`
- `migrations/mysql/V015__core__mails.sql`
- `migrations/mysql/V016__core__webhook_hardening.sql`
- `migrations/mysql/V017__core__lazy_field_types.sql`
- `migrations/mysql/V018__core__timezone_system.sql`
- `migrations/mysql/V019__core__unique_content_slug.sql`
- `migrations/mysql/V020__core__unique_menus_slug.sql`
- `migrations/mysql/V021__core__fix_double_encoded_content_body.sql`
- `migrations/mysql/V022__core__theme_config_history.sql`
- `migrations/mysql/V023__core__fix_theme_config_history_scope.sql`
- `migrations/mysql/V024__core__field_group_ownership_and_page_definitions.sql`
- `migrations/mysql/V025__core__canonicalize_content_field_values.sql`
- `migrations/mysql/V026__core__content_types_source_admin.sql`
- `migrations/mysql/V027__core__content_parent_and_hub.sql`
- `migrations/mysql/V028__core__user_rls_support.sql`
- `migrations/mysql/V029__core__tenant_owned_themes.sql`
- `migrations/mysql/V030__core__canonicalize_timezone_settings.sql`
- `migrations/mysql/V031__core__settings_contract.sql`

### 3.2 Migrações MariaDB (`migrations/mariadb/`)
Deletar todos os 31 arquivos (mesma lista, diretório `mariadb/`).

### 3.3 Schemas provider-specific
- `packages/database/src/schema/schema.mysql.sql`
- `packages/database/src/schema/schema.mariadb.sql`

### 3.4 Compose infra provider-specific (dentro de `assets.ts` — não arquivo separado, mas blocos dentro de `assets.ts`)
Os blocos `COMPOSE_INFRA_MYSQL` e `COMPOSE_INFRA_MARIADB` dentro de `packages/cli/src/assets.ts` são strings embutidas, não arquivos separados. Eles são removidos/editados no código.

### 3.4 Diretórios vazios após remoção
- `migrations/mysql/` (deletar diretório se vazio)
- `migrations/mariadb/` (deletar diretório se vazio)

---

## 4. Arquivos para MODIFICAR (código e config)

### 4.1 `packages/database/src/connection.ts`
- Remover imports `mysql from 'mysql2/promise'` e `mariadb from 'mariadb'`
- Remover função `mysqlConnection()` e toda a lógica de pool MySQL/MariaDB
- Simplificar `executeMySql` / `mysqlConnection` para apenas Postgres
- Remover `mysqlError()`
- Simplificar `getDatabaseCapabilities()` para retornar `rowLevelSecurity: true` apenas (sem branch MySQL/MariaDB)
- Remover `translateProviderSql()` ou esvaziar para retornar a mesma string (não há mais tradução necessária)
- Atualizar `DatabaseDriver` type para apenas `'postgres'`
- Atualizar `DatabaseConfig` para remover campos específicos de MySQL/MariaDB se existirem

### 4.2 `packages/database/src/index.ts`
- Remover export de funções/tipos relacionados a MySQL/MariaDB se existirem
- Manter apenas exports Postgres

### 4.3 `packages/database/src/migrations/runner.ts`
- Remover branch `provider === 'mysql' || provider === 'mariadb'` na linha 498
- Simplificar para aceitar apenas `'postgres'`

### 4.4 `packages/database/src/migrations/bootstrap.ts`
- Remover tipo `'mysql' | 'mariadb'` do provider
- Simplificar para apenas `'postgres'`

### 4.5 `packages/database/src/schema/index.ts`
- Remover parâmetro `provider` de `getSchema()`, retornar apenas `schema.sql`

### 4.6 `packages/database/src/rls/index.ts`
- Manter (RLS é apenas Postgres agora)

### 4.7 `packages/database/src/rls-helpers.ts`
- Manter (apenas Postgres)

### 4.8 `packages/config/src/index.ts`
- Alterar `DatabaseDriver` type para `'postgres'` apenas
- Remover branches `mysql` e `mariadb` do `parseDatabaseUrl()`
- Remover validação que aceita `mysql://` / `mariadb://` como protocolo válido

### 4.9 `packages/cli/src/database-config.ts`
- Alterar `DatabaseEngine` type para `'postgres'` apenas
- Remover branches mysql/mariadb de `parseDatabaseUrl()`
- Simplificar `resolveDatabaseConfig()` para apenas Postgres

### 4.10 `packages/cli/src/dev.ts`
- Remover branches `mysql` / `mariadb` de `waitForDatabaseReady()`
- Remover `mysqladmin ping` e `healthcheck.sh` para não-Postgres
- Simplificar para apenas `pg_isready`

### 4.11 `packages/cli/src/assets.ts`
- Remover `composeInfraMysql` e `composeInfraMariadb` de `ASSET_MIRROR`
- Remover blocos `COMPOSE_INFRA_MYSQL` e `COMPOSE_INFRA_MARIADB` (strings grandes)
- Remover sufixos `okcms-mysql` e `okcms-mariadb` de `applyDockerProjectSuffix`
- Simplificar `getInfraCompose()` para apenas Postgres
- Remover referências a `engine === 'mysql'` / `engine === 'mariadb'`

### 4.12 `packages/cli/src/scaffold.ts`
- Remover suporte a `provider: 'mysql' | 'mariadb'` na opção de scaffold
- Simplificar para apenas `postgres`
- Remover geração de compose MySQL/MariaDB nas linhas 506-517

### 4.13 `packages/cli/src/commands.ts`
- Remover `--db-engine` choices `mysql` / `mariadb`
- Simplificar para apenas `postgres`

### 4.14 `packages/cli/src/wizard-env.ts`
- Remover opções `mysql` / `mariadb` do select de engine de banco
- Simplificar para apenas `postgres`

### 4.15 `packages/cli/src/wizard-env.test.ts`
- Ajustar teste que simula seleção de engine (remover casos mysql/mariadb)

### 4.16 `packages/cli/src/env-schema.ts`
- Remover `mysql` / `mariadb` das opções de `DB_ENGINE`
- Ajustar descrição de `DATABASE_URL` para apenas `postgres://` / `postgresql://`

### 4.17 `packages/cli/src/db-dump.ts`
- Remover suporte a `mysqldump` / `mariadb-dump` e `mysql` / `mariadb` client
- Simplificar para apenas `pg_dump` / `psql` (Postgres)

### 4.18 `packages/cli/src/doctor.ts`
- Simplificar validação de engine para apenas `postgres`

### 4.19 `packages/cli/src/bluegreen.ts`
- Simplificar validação de provider para apenas `'postgres'`

### 4.20 `packages/cli/src/command-registry.ts` (se houver referência)
- Verificar se há comandos específicos de MySQL/MariaDB (nenhuma referência encontrada — sem alteração)

### 4.21 `packages/database/src/index.ts`
- Verificar se há exports relacionados a MySQL/MariaDB (nenhuma referência encontrada — sem alteração)

### 4.22 `packages/cli/src/doctor.ts`
- Linha 88: simplificar `['postgres', 'mysql', 'mariadb'].includes(database.engine)` para apenas `['postgres']`
- Linha 95: simplificar validação `!['postgres', 'mysql', 'mariadb'].includes(database.engine)`

### 4.23 `packages/cli/src/scaffold-docs.ts`
- Linhas 1045-1046: remover texto da matriz de banco que menciona MySQL/MariaDB na documentação gerada pelo scaffold
- Manter apenas referência a PostgreSQL

### 4.21 `packages/cli/src/wp-migrate/connectors/mysql.ts`
- **Manter ou remover?** O WP Migrate usa MySQL como origem de dados do WordPress, não como provedor do OkCMS. Este é um conector de importação WP, não o provedor de banco do CMS. **Decisão recomendada:** manter `wp-migrate/connectors/mysql.ts` pois ele conecta em WordPress externo (origem de dados), não no banco do OkCMS. No entanto, se o objetivo é remover todo suporte a MySQL, avaliar se este conector também sai. Recomenda-se **manter** com nota de que é para importação WP, não provedor OkCMS.

### 4.22 `packages/auth/src/`, `packages/core/src/`, `packages/api/`, etc.
- Verificar se há código específico de MySQL/MariaDB (provavelmente não, pois tudo vai através de `@oktis-works/database`)

---

## 5. Scripts para remover ou ajustar

### 5.1 `scripts/generate-provider-schemas.mjs`
- Remover loop `for (const provider of ['mysql', 'mariadb'])`
- Manter apenas geração de `schema.sql` (Postgres) — ou remover o script inteiro se não for mais necessário

### 5.2 `scripts/generate-provider-migrations.mjs`
- Remover loop `for (const provider of ['mysql', 'mariadb'])`
- Remover geração de migrações provider-specific

### 5.3 `scripts/check-audit-contract.mjs`
- Remover verificação de diretórios `migrations/mysql/` e `migrations/mariadb/`
- Remover contagem de 31 arquivos por provedor
- Remover verificação de `provider=mysql` / `provider=mariadb` nos headers

### 5.4 `scripts/check-provider-matrix.mjs`
- Remover verificação de dependências `mysql2` e `mariadb`
- Remover verificação de arquivos `schema.mysql.sql` e `schema.mariadb.sql`
- Remover verificação de sets de migração MySQL/MariaDB
- Remover verificação de tokens `mysql:8.0.36`, `mariadb:11.4`, `OKCMS_MYSQL_ACCEPTANCE_URL`, `OKCMS_MARIADB_ACCEPTANCE_URL` no CI
- Simplificar para apenas Postgres

### 5.5 `scripts/e2e-api.mjs`
- Verificar se há referência a MySQL/MariaDB (provavelmente não, usa Postgres)

### 5.6 `scripts/e2e-dev-login.mjs` (novo)
- Já usa apenas Postgres via `DATABASE_URL`

---

## 6. Testes para remover ou ajustar

### 6.1 `packages/database/src/connection.test.ts`
- Remover casos de teste que usam `'mysql'` e `'mariadb'` como argumento de `translateProviderSql()`
- Manter apenas testes Postgres

### 6.2 `packages/database/src/schema/index.test.ts`
- Remover `it.each(['postgres', 'mysql', 'mariadb'])` — manter apenas `'postgres'`

### 6.3 `packages/database/src/migrations/runner.test.ts`
- Remover casos de teste com `provider: 'mysql'`

### 6.4 `packages/database/src/migrations/preflight.test.ts`
- Remover caso de teste com `provider: 'mysql'`

### 6.5 `packages/cli/src/dev.test.ts`
- Remover teste com `DB_ENGINE: 'mysql'` (linha 542)

### 6.6 `packages/cli/src/scaffold.test.ts`
- Remover teste com `{ provider: 'mysql' }` (linhas 223-234)

### 6.7 `packages/cli/src/wizard-env.test.ts`
- Ajustar teste que simula seleção de engine (remover casos mysql/mariadb)

### 6.8 `packages/cli/src/cli-new-tools.test.ts`
- Remover teste `parseDatabaseUrl('mysql://h/db')` e `parseDatabaseUrl('mariadb://h/db')`

### 6.9 `packages/cli/src/parser.test.ts`
- Remover teste com `--target mysql`

### 6.10 `packages/config/src/index.test.ts` e `index.test.js`
- Remover testes com URLs `mysql://` e `mariadb://`

---

## 7. Workflows CI/CD

### 7.1 `.github/workflows/ci.yml`
- Remover serviços `mysql` e `mariadb` da seção `services` (linhas 31-52)
- Remover job ou etapa "MySQL and MariaDB acceptance matrix" (linhas 75-79)
- Remover variáveis `OKCMS_MYSQL_ACCEPTANCE_URL` e `OKCMS_MARIADB_ACCEPTANCE_URL`
- Manter apenas serviço `postgres` e job "PostgreSQL acceptance matrix"
- Remover `bun run test:providers` se existir (ou ajustar para não rodar provedores não-Postgres)

---

## 8. Documentação para atualizar

### 8.1 `AGENTS.md`
- Seção §12 "Database Provider Abstraction Rules": remover menções a MySQL/MariaDB, manter apenas PostgreSQL
- Linha 157: alterar para "The database layer supports PostgreSQL only."
- Remover linhas 286-291 (start containers MySQL/MariaDB)
- Remover referências a `rowLevelSecurity` para não-Postgres

### 8.2 `README.md` (raiz)
- Linha 237: remover `OtherDb[("MySQL 8 / MariaDB 11.4")]` do diagrama/texto

### 8.3 `README.pt-BR.md` (raiz)
- Linha 221: remover referência equivalente

### 8.4 `docs/provider-matrix.md`
- Remover linhas da tabela MySQL e MariaDB
- Remover menção a `mysql://` / `mariadb://` no `DATABASE_URL`
- Simplificar para apenas PostgreSQL

### 8.5 `docs/provider-matrix.pt-BR.md`
- Mesma alteração em português

### 8.6 `docs/operator-guide.md`
- Linha 18: remover MySQL/MariaDB da lista de bancos suportados
- Linha 317: remover menção a drivers/schemas separados

### 8.7 `docs/operator-guide.pt-BR.md`
- Mesma alteração em português

### 8.8 `packages/database/README.md`
- Linha 3: alterar descrição para apenas Postgres
- Remover referências a `mysql/` e `mariadb/` na árvore de arquivos
- Remover seção "MySQL/MariaDB — manual sync..."

### 8.9 `packages/config/README.md`
- Linha 23: alterar type para apenas `'postgres'`

### 8.10 CHANGELOGs
- Não editar CHANGELOGs existentes (histórico). Apenas novos entries para a versão de remoção.

---

## 9. Dependências npm

### 9.1 `package.json` (raiz) e `packages/database/package.json`
- Remover `mysql2` e `mariadb` das dependências (se estiverem listadas diretamente)
- Remover do `bun.lock` (será regenerado com `bun install`)

### 9.2 `packages/cli/package.json`
- Verificar se `mysql2` está listado (para wp-migrate — manter se for usado apenas para importação WP)

---

## 10. Passos de execução (fases)

### Fase 0 — Preparação
- [ ] Criar branch `release/vX.Y.Z` a partir de `main`
- [ ] Validar `CMS_VERSION` nos 3 anchors
- [ ] Criar changeset para `@oktis-works/database` e `@oktis-works/cli` (pelo menos)

### Fase 1 — Código fonte (packages)
- [ ] Remover MySQL/MariaDB de `packages/database/src/connection.ts`
- [ ] Simplificar `packages/database/src/index.ts`
- [ ] Simplificar `packages/database/src/migrations/runner.ts`
- [ ] Simplificar `packages/database/src/migrations/bootstrap.ts`
- [ ] Simplificar `packages/database/src/schema/index.ts`
- [ ] Simplificar `packages/config/src/index.ts`
- [ ] Simplificar `packages/cli/src/database-config.ts`
- [ ] Simplificar `packages/cli/src/dev.ts`
- [ ] Simplificar `packages/cli/src/assets.ts`
- [ ] Simplificar `packages/cli/src/scaffold.ts`
- [ ] Simplificar `packages/cli/src/commands.ts`
- [ ] Simplificar `packages/cli/src/wizard-env.ts`
- [ ] Simplificar `packages/cli/src/env-schema.ts`
- [ ] Simplificar `packages/cli/src/db-dump.ts`
- [ ] Simplificar `packages/cli/src/doctor.ts`
- [ ] Simplificar `packages/cli/src/bluegreen.ts`

### Fase 2 — Scripts e automação
- [ ] Ajustar `scripts/generate-provider-schemas.mjs`
- [ ] Ajustar `scripts/generate-provider-migrations.mjs`
- [ ] Ajustar `scripts/check-audit-contract.mjs`
- [ ] Ajustar `scripts/check-provider-matrix.mjs`

### Fase 3 — Testes
- [ ] Remover ou ajustar testes de `connection.test.ts`, `schema/index.test.ts`, `runner.test.ts`, `preflight.test.ts`, `dev.test.ts`, `scaffold.test.ts`, `wizard-env.test.ts`, `cli-new-tools.test.ts`, `parser.test.ts`, `index.test.ts`

### Fase 4 — Arquivos para deletar
- [ ] Deletar `migrations/mysql/` (31 arquivos + diretório)
- [ ] Deletar `migrations/mariadb/` (31 arquivos + diretório)
- [ ] Deletar `packages/database/src/schema/schema.mysql.sql`
- [ ] Deletar `packages/database/src/schema/schema.mariadb.sql`

### Fase 5 — CI/CD
- [ ] Ajustar `.github/workflows/ci.yml` (remover serviços mysql/mariadb e job de acceptance)

### Fase 6 — Documentação
- [ ] Atualizar `AGENTS.md`
- [ ] Atualizar `README.md`, `README.pt-BR.md`
- [ ] Atualizar `docs/provider-matrix.md`, `docs/provider-matrix.pt-BR.md`
- [ ] Atualizar `docs/operator-guide.md`, `docs/operator-guide.pt-BR.md`
- [ ] Atualizar `packages/database/README.md`
- [ ] Atualizar `packages/config/README.md`

### Fase 7 — Dependências
- [ ] Remover `mysql2` e `mariadb` de `package.json`s relevantes
- [ ] Rodar `bun install` para atualizar `bun.lock`

### Fase 8 — Validação pré-release
- [ ] `bun run test:run`
- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] `bun run build`
- [ ] `bun run audit:contracts`
- [ ] `bun run check:provider-matrix` (ajustado)
- [ ] `bun run check:api-drift`

### Fase 9 — Changesets e versão
- [ ] Criar changesets para pacotes afetados
- [ ] Rodar `bun run version-packages`
- [ ] Rodar `bun run sync-version --write`
- [ ] Bump versão root se necessário (major por breaking change de provedores)

### Fase 10 — Commit e release
- [ ] Commit com mensagem conventional
- [ ] Push branch `release/vX.Y.Z`
- [ ] Merge PR para `main` (publish automático)

---

## 11. Justificativa para o commit

**Mensagem sugerida:**
```
chore(release): drop MySQL/MariaDB support, PostgreSQL only

Remove multi-provider database support to reduce complexity and eliminate
cross-tenant data leak risk. MySQL and MariaDB lack native Row Level
Security, so tenant isolation relied solely on application-side WHERE
filters — without RLS as a database-level backstop, any missed filter
leaks data between tenants. PostgreSQL is the only provider with FORCE
ROW LEVEL SECURITY, matching the OkCMS security model.

Deletes:
- migrations/mysql/ and migrations/mariadb/ (31 files each)
- packages/database/src/schema/schema.mysql.sql and schema.mariadb.sql
- MySQL/MariaDB compose blocks in assets.ts
- mysql2 and mariadb dependencies
- CI services and acceptance matrix for MySQL/MariaDB

Simplifies:
- translateProviderSql() removed (no non-Postgres dialect to translate)
- DatabaseDriver/DatabaseEngine types reduced to 'postgres'
- Schema and migration snapshots reduced to a single Postgres set
- CI matrix reduced to PostgreSQL only

Updates:
- AGENTS.md, READMEs, docs/provider-matrix, docs/operator-guide
- packages/database/README.md, packages/config/README.md
```

---

## 12. Checklist de não-regressão

- [ ] Nenhuma referência a `mysql://` ou `mariadb://` permanece em código de conexão do OkCMS
- [ ] `getDatabaseCapabilities().rowLevelSecurity` é `true` (apenas Postgres)
- [ ] `DB_ENGINE` não aceita mais `mysql` ou `mariadb`
- [ ] `DATABASE_URL` aceita apenas `postgres://` / `postgresql://`
- [ ] Nenhum arquivo em `migrations/mysql/` ou `migrations/mariadb/`
- [ ] Nenhum arquivo `schema.mysql.sql` ou `schema.mariadb.sql`
- [ ] CI não sobe containers MySQL/MariaDB
- [ ] `bun run build`, `bun run test:run`, `bun run typecheck`, `bun run lint` passam

---

## 13. Observação sobre wp-migrate

O conector `packages/cli/src/wp-migrate/connectors/mysql.ts` conecta em WordPress externo como **origem de dados de importação**, não como provedor de banco do OkCMS. Recomenda-se **mantê-lo** com documentação esclarecendo que é para migração de conteúdo WP, não para operação do CMS. Se a decisão for remover todo suporte a MySQL independentemente do contexto, este conector também deve ser avaliado para remoção ou reescrita para usar Postgres como destino (o que já é o padrão — o WP migra para o banco Postgres do OkCMS).

---

**Nenhum arquivo foi alterado.** Este documento é apenas o plano. Quando aprovado, iniciar execução fase por fase.