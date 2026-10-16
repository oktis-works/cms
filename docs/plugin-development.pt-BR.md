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
okcms plugin:create --name meu-plugin
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
  "compatibility": { "okcms": "^0.5.5" }
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
  // Filtro real: roda em toda listagem de conteúdo (ex.: GET /api/v1/content)
  registry.addFilter('content:query', (items) => items);

  // Action real: disparada após publicar um conteúdo do tipo "post"
  registry.addAction('after_publish_content_post', (content) => {
    console.log('[meu-plugin] publicado:', content.slug);
  });
};
```

O `register(registry)` é chamado quando o plugin é carregado. Use o registro
para expor filters (transformações) — veja o que existe em
`GET /api/v1/hooks/catalog` para os nomes e contratos disponíveis.

O carregamento acontece no boot de todos os processos (API, web e worker):
plugins com status `ACTIVATED` no banco têm o `register` chamado e os hooks
entram no registry compartilhado. Ativar/desativar pela API recarrega no
próprio processo da API na hora; web/worker pegam a mudança no próximo
restart. Um plugin que falha ao carregar é isolado: a falha é reportada no
log e nunca derruba o boot dos outros plugins nem do processo.

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
okcms plugin:create --name meu-plugin

# 2. Implemente plugins/meu-plugin/index.js

# 3. Se criou FORA do projeto, instale (valida compatibilidade e copia para plugins/)
okcms plugin:install --name ../meu-plugin-fonte

# 4. Gestão
okcms plugin:list                                # instalados + estado local
okcms plugin:manage -n meu-plugin --info         # informações do manifesto
okcms plugin:manage -n meu-plugin --disable      # marca como desabilitado no estado local (.okcms/extensions.json)
okcms plugin:manage -n meu-plugin --enable       # marca como habilitado de novo (mesmo estado local)
okcms plugin:manage -n meu-plugin --uninstall    # remove os arquivos do projeto
# O runtime lê o status no banco: ative/desative pelo admin (carregado no boot).

# 5. Busca no npm (pacotes com a keyword okcms-plugin)
okcms plugin:search -q galeria

# 6. Publicou/atualizou? Stage do SQL + build dos temas + deploy (destino salvo)
okcms redeploy --dry-run   # só mostra o plano
okcms redeploy
```

## Publicando

Empacote o diretório do plugin como pacote npm com a keyword
`okcms-plugin` (é o que o `okcms plugin:search` consulta) e mantenha
`compatibility.okcms` atualizado para a linha do CMS que você suporta.
