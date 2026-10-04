> 📄 **Português (Brasil)** · [English](./plugin-development.md)

# Desenvolvendo um Plugin

Plugin é a extensão que se registra no runtime do CMS e participa do sistema
de **hooks e filters** (transformar dados, reagir a eventos de conteúdo etc.).
O catálogo de hooks disponíveis é servido pela API em
`GET /api/v1/hooks/catalog`.

> Os comandos usam `npx` com a CLI local do projeto (sem instalação
> global). Com a CLI global (`bun add -g @oktis-works/cms`), rode
> `okcms ...` direto.

## Estrutura gerada

```bash
npx okcms plugin:create --name meu-plugin
```

```
plugins/meu-plugin/
├── manifest.json   # identidade + permissões + compatibilidade
├── index.js        # entrypoint: module.exports.register(registry)
└── README.md
```

### manifest.json

```json
{
  "name": "meu-plugin",
  "version": "0.1.0",
  "description": "Plugin meu-plugin para OkCMS",
  "type": "plugin",
  "main": "index.js",
  "scope": "tenant",
  "permissions": [],
  "compatibility": { "okcms": "^0.2.0" }
}
```

| Campo | Significado |
|---|---|
| `type` | `"plugin"` (fixo — temas usam `"theme"`) |
| `main` | Arquivo de entrada com o registro |
| `scope` | Escopo de atuação no multi-tenant (ex.: `tenant`) |
| `permissions` | Permissões que o plugin pede (vazio = nenhuma) |
| `compatibility.okcms` | Range semver exigido do CMS. **O scaffold preenche com a versão atual automaticamente** e o valor é validado no scaffold e em cada instalação — manifesto incompatível é rejeitado. |

### index.js

```js
'use strict';

module.exports.register = function register(registry) {
  registry.addFilter('theme:data:posts', (value) => value);
};
```

O `register(registry)` é chamado quando o plugin é carregado. Use o registro
para expor filters (transformações) — veja o que existe em
`GET /api/v1/hooks/catalog` para os nomes e contratos disponíveis.

## Migrations do banco

Se o plugin cria ou altera tabelas, o SQL mora **dentro do plugin**:

```bash
plugins/meu-plugin/
└── migrations/
    ├── V001__meu_plugin__tabelas.sql
    └── V002__meu_plugin__colunas.sql
```

O nome segue o padrão do runner — `V<numero>__<owner>__<nome>.sql` — e o
`owner` (aqui `meu_plugin`) é o que marca a migration como do plugin: o
rastreamento é por `owner:version`, então cada plugin tem a sua própria
linha de versão.

O SQL **não** é aplicado direto do diretório do plugin. O `okcms redeploy`
copia `plugins/<n>/migrations/*.sql` para `migrations/` (o único diretório
que o runner lê) e o `db:migrate` do deploy aplica — assim o schema do plugin
fica versionado e revisável no repositório do projeto.

Duas regras que o redeploy impõe:

- arquivo fora do padrão `V###__owner__nome.sql` **nunca** é copiado (e um
  já existente em `migrations/` quebraria todo `db:migrate` — o comando
  falha antes de tocar no Docker e diz qual arquivo renomear);
- uma migration já aplicada é imutável: se o plugin novo trouxer outro
  conteúdo com o mesmo nome, o redeploy **não** sobrescreve o arquivo que já
  está em `migrations/`, só avisa. Publique uma `V00n+1`.

## Fluxo de desenvolvimento

```bash
# 1. Crie (em ./plugins do projeto, ou num workspace externo com --dir)
npx okcms plugin:create --name meu-plugin

# 2. Implemente plugins/meu-plugin/index.js

# 3. Se criou FORA do projeto, instale (valida compatibilidade e copia para plugins/)
npx okcms plugin:install --name ../meu-plugin-fonte

# 4. Gestão
npx okcms plugin:list                                # instalados + status
npx okcms plugin:manage -n meu-plugin --info         # informações do manifesto
npx okcms plugin:manage -n meu-plugin --disable      # desabilita (mantém os arquivos)
npx okcms plugin:manage -n meu-plugin --enable       # habilita de novo
npx okcms plugin:manage -n meu-plugin --uninstall    # remove arquivos + registro

# 5. Busca no npm (pacotes com a keyword okcms-plugin)
npx okcms plugin:search -q galeria

# 6. Publicou/atualizou? Stage do SQL + build dos temas + deploy blue/green
npx okcms redeploy --dry-run   # só mostra o plano
npx okcms redeploy
```

## Publicando

Empacote o diretório do plugin como pacote npm com a keyword
`okcms-plugin` (é o que o `okcms plugin:search` consulta) e mantenha
`compatibility.okcms` atualizado para a linha do CMS que você suporta.
