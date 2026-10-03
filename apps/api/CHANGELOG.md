# @oktis-works/api

## 0.1.4

### Patch Changes

- Log de start do admin com URL correta: `http://` no lugar de `https://` (o `@astrojs/node` calcula o protocolo com `server instanceof https.Server`, que sob Bun responde `true` até para `http.Server`) e sem a linha `network:` com IP interno de WSL. Deps internas publicadas como range `^X.Y.Z` em vez de pin exato — o consumidor resolve a versão atual via `bun update` sem cópias aninhadas stale (ex.: `api` preso em `database@0.1.3`) e dependentes não precisam ser republicados a cada patch.
- Updated dependencies []:
  - @oktis-works/validation@0.1.11
  - @oktis-works/core@0.1.11
  - @oktis-works/types@0.1.11
  - @oktis-works/auth@0.1.11
  - @oktis-works/config@0.1.11
  - @oktis-works/database@0.1.11

## 0.1.3

### Patch Changes

- Scaffold zero-config: `okcms init` agora gera o `package.json` do projeto com os apps do OkCMS (@oktis-works/api, admin, web) já como dependências na versão do CLI e instala tudo automaticamente (bun, com fallback para npm). `okcms update` passa a funcionar de imediato e o `okcms build` degrada com mensagem clara fora de workspaces (os apps vêm pré-compilados do npm).
- Updated dependencies []:
  - @oktis-works/validation@0.1.3
  - @oktis-works/core@0.1.3
  - @oktis-works/types@0.1.3
  - @oktis-works/auth@0.1.3
  - @oktis-works/config@0.1.3
  - @oktis-works/database@0.1.3
