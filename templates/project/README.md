# OkCMS - Project Template

Template mínimo para iniciar um projeto OkCMS.

## Uso

```bash
okcms init meu-site
cd meu-site
docker compose up -d      # PostgreSQL + Redis locais (healthcheck + volume)
okcms db:migrate          # cria o schema no banco
okcms start
```

## Estrutura

- `docker-compose.yml` — PostgreSQL + Redis local com healthcheck
- `.env.example` — modelo de variáveis (o `okcms init` já gera o `.env`)
- `themes/` — temas instalados (criado pelo CLI)
- `plugins/` — plugins instalados (criado pelo CLI)
