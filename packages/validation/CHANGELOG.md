# @oktis-works/validation

## 0.1.6

### Patch Changes

- Scaffold gera documentação para o usuário final: `README.md` (visão do sistema, uso local e Docker, tabela de comandos, banco e conexão), `PLUGIN.md` (guia de desenvolvimento de plugins: manifest, hooks, fluxo create/instal/gestão, publicação) e `THEME.md` (temas: templates, engines css/scss/tailwind, build com isolamento, ativação). Arquivos não são sobrescritos em re-init.

## 0.1.5

### Patch Changes

- Scaffold para dev local completo: `@oktis-works/worker` nas dependências (filas/jobs) e `@oktis-works/cms` nas devDependencies (CLI fixada no projeto). `okcms start` agora sobe o worker junto (api + admin + web + worker; flag `--worker`/`-W`). Correção: o range das dependências passa a ser `^MAIOR.MENOR.0` em vez de `^versão-exata-do-CLI` — com apps independentes no changesets, a range exata quebrava o `install` com ETARGET quando CLI e apps não eram publicados juntos (caso do 0.1.4).

## 0.1.4

### Patch Changes

- Conexão com o banco com dois formatos à escolha do usuário: `DATABASE_URL` (tem precedência) ou variáveis separadas `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`. `.env` é a fonte única de conexão — `okcms.config.json` deixou de ter bloco `database` (mantém só estrutura: nome, ports, storage, dirs). `okcms doctor` aceita os dois formatos (check `database` + `db-tcp`, agora também `mysql://`).

## 0.1.3

### Patch Changes

- Scaffold zero-config: `okcms init` agora gera o `package.json` do projeto com os apps do OkCMS (@oktis-works/api, admin, web) já como dependências na versão do CLI e instala tudo automaticamente (bun, com fallback para npm). `okcms update` passa a funcionar de imediato e o `okcms build` degrada com mensagem clara fora de workspaces (os apps vêm pré-compilados do npm).
