---
"@oktis-works/cms": patch
---

Fix crítico: `okcms dev` falhava com "required variable DB_PASSWORD is missing a value" mesmo com `DB_PASSWORD` preenchido na `.env` da raiz.

- CAUSA: o bun carrega o `.env` do cwd no START de cada processo e não sobrescreve o que já está definido. O menu `okcms` nasce com o snapshot do template do `okcms init` (`DB_PASSWORD=` vazio); a entrevista grava o valor só no ARQUIVO; o `okcms dev` spawnado herda `DB_PASSWORD=''` — e a env vazia do processo vence o `--env-file` na interpolação do docker compose (`''` conta como ausente no `${DB_PASSWORD:?...}`).
- FIX (3 camadas):
  - `runCompose` agora spawna o docker com `projectProcessEnv(cwd)`: valores não-vazios da `.env` da raiz sobrescrevem o snapshot do processo (todas as chamadas — infra, lanes, app);
  - `syncProcessEnv`: quem grava o `.env` (entrevista do wizard, `okcms config`) sincroniza `process.env`, e o `okcms dev` cura o processo a partir do arquivo antes de subir infra/migrations (sem isso, as migrations conectariam com o placeholder vazio enquanto o compose criava o banco com o valor do arquivo);
  - valor vazio no arquivo não toca o processo — exportação de shell/CI segue valendo.
