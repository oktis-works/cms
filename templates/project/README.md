# OkCMS - Project Template

Template mínimo para iniciar um projeto OkCMS.

## Uso

```bash
okcms init meu-site
cd meu-site
cp env.example .env
docker compose up -d
okcms start
```

## Estrutura

- `docker-compose.yml` — PostgreSQL + Redis local com healthcheck
- `env.example` — variáveis de ambiente do projeto
- `themes/` — temas instalados (criado pelo CLI)
- `plugins/` — plugins instalados (criado pelo CLI)
