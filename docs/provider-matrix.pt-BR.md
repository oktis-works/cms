# Matriz de provedores e versões de banco

O OkCMS suporta três provedores. MySQL e MariaDB são alvos de compatibilidade
independentes; passar nos testes de um não comprova suporte ao outro.

| Provedor | Versões suportadas | Driver | Porta padrão | TLS |
|---|---|---|---:|---|
| PostgreSQL | 16.x | `postgres` 3.4.x | 5432 | desativado, require, verify-ca, verify-full |
| MySQL | 8.0.36 e 8.4 LTS | `mysql2` 3.24.x | 3306 | desativado, CA, verificação de certificado |
| MariaDB | 11.4 LTS | `mariadb` 3.5.x | 3306 | desativado, CA, verificação de certificado |

Os runtimes suportados são Node.js `>=22.17.0` e Bun `>=1.4.4`. A versão
mínima do servidor é verificada antes de qualquer alteração de schema. Servidor
antigo ou desconhecido interrompe o comando antes de migrations e seeds.

`DATABASE_URL` aceita `postgres://`, `postgresql://`, `mysql://` ou
`mariadb://`. Quando informado, o protocolo deve concordar com `DB_ENGINE` e
`DB_DRIVER`; conflitos são rejeitados com erro sem credenciais.

Schemas e diretórios de migration são específicos por provedor. RLS do
PostgreSQL não é reivindicado para MySQL/MariaDB: esses provedores usam
predicados explícitos de tenant e autorização na camada de aplicação/dados.
