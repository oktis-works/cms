# @oktis-works/ui

## 0.1.4

### Patch Changes

- Tenant context usa set_config parametrizado no setTenantContext e no migration runner (`SET x = $1` não existe no Postgres — syntax error 42601 quebrava login e X-Tenant-ID); ui atualiza solid-js para 1.9.15 (cópia única com o admin em Astro 7).

## 0.1.3

### Patch Changes

- Scaffold zero-config: `okcms init` agora gera o `package.json` do projeto com os apps do OkCMS (@oktis-works/api, admin, web) já como dependências na versão do CLI e instala tudo automaticamente (bun, com fallback para npm). `okcms update` passa a funcionar de imediato e o `okcms build` degrada com mensagem clara fora de workspaces (os apps vêm pré-compilados do npm).
- Updated dependencies []:
  - @oktis-works/validation@0.1.3
