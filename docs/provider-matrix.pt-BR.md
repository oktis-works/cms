# Matriz de provedores e versões de banco

O OkCMS suporta **PostgreSQL 16+** como seu único provedor de banco de dados.

| Provedor | Versões suportadas | Driver | Porta padrão | TLS |
|---|---|---|---:|---|
| PostgreSQL | 16.x | `postgres` 3.4.x | 5432 | desativado, require, verify-ca, verify-full |

Os runtimes suportados são Node.js `>=22.23.0` e Bun `>=1.4.4`. A versão
mínima do servidor é verificada antes de qualquer alteração de schema. Servidor
antigo ou desconhecido interrompe o comando antes de migrations e seeds.

`DATABASE_URL` aceita `postgres://` ou `postgresql://`. Quando informado, o
protocolo deve concordar com `DB_ENGINE` e `DB_DRIVER`; conflitos são rejeitados
com erro sem credenciais.

PostgreSQL RLS (`FORCE ROW LEVEL SECURITY`) é o backstop de banco de dados para
isolamento de tenant.
