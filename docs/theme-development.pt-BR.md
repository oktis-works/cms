> 📄 **Português (Brasil)** · [English](./theme-development.md)

# Desenvolvendo um Tema

Tema é o visual do site público: **templates** (hierarquia de páginas) +
**estilos**, com isolamento por `[data-theme]` para que um tema nunca vaze
CSS para outro.

> Os comandos usam `npx` com a CLI local do projeto (sem instalação
> global). Com a CLI global (`bun add -g @oktis-works/cms`), rode
> `okcms ...` direto.

## Estrutura gerada

```bash
npx okcms theme:create --name meu-tema --style css   # css | scss | tailwind
```

```
themes/meu-tema/
├── theme.json               # manifest (type: theme + compatibilidade)
├── templates/
│   ├── index.html           # listagem (home)
│   └── single.html          # página única (post/conteúdo)
├── style.css                # engine css — ou styles/main.scss — ou src/input.css
└── README.md
```

### theme.json

```json
{
  "name": "meu-tema",
  "version": "0.1.0",
  "description": "Tema meu-tema para OkCMS",
  "type": "theme",
  "compatibility": { "okcms": "^0.2.0" }
}
```

Com `--style scss` ou `--style tailwind`, o manifesto ganha também
`stylesConfig` (`engine`, `entry`, `output`, `isolation`) apontando para a
entrada de estilos. `compatibility.okcms` é preenchido e validado
automaticamente, como nos plugins.

### Templates

Templates são arquivos `*.astro` **na raiz do tema** — é o formato que o
runtime do site busca (hierarquia `home` → `index` → `404`, com fallback
`_shared` → `default`). Sintaxe com variáveis, HTML cru e laços/condições:

```html
<main class="site">
  {{#each items}}
    <article>
      <h2>{{title}}</h2>
      <p>{{excerpt}}</p>
    </article>
  {{/each}}
</main>
```

- `{{variável}}` — valor com escape HTML; `{{{html}}}` — sem escape (HTML do conteúdo)
- `{{#each}}` / `{{#if}}` aninhados, caminhos pontuados (`content.author.name`)
- `home.astro` — home (`{{site.title}}`, `{{#each items}}`)
- `index.astro`, `single.astro`, `page.astro` — conteúdo (`{{content.*}}`, `{{page.title}}`)
- `archive.astro` — listagem por tipo/taxonomia (`{{#each items}}`)
- `404.astro` — última da cadeia
- Contexto disponível: `site.*`, `page.*`, `content.*` (colunas + campos), `items`,
  `menus`, `contentTypes`, `taxonomies`, `terms`, `settings`

## Estilos por engine

| `--style` | Arquivo gerado | Build |
|---|---|---|
| `css` (default) | `dist/theme.css` | nenhum — servido direto |
| `scss` | `styles/main.scss` (+ `components.scss`) | `okcms theme:build -n meu-tema` |
| `tailwind` | `src/input.css` + `tailwind.config.js` | `okcms theme:build -n meu-tema` |

O site público só linka `/themes/<tema>/dist/theme.css` — no engine `css` o
arquivo já nasce em `dist/` (servível sem build). Nos demais, o build compila
para `dist/theme.css` **com isolamento `[data-theme="meu-tema"]`** (sem vazar
estilos entre temas; o Tailwind já sai com `preflight: false`).

### Contrato de isolamento (`stylesConfig.isolation`)

| valor | significado |
|---|---|
| `true` | o build escopa o CSS (obrigatório/automático em `scss`/`tailwind`) |
| `"manual"` | **apenas engine css** — o autor entrega o `dist/theme.css` já isolado (como no tema default); o build não mexe |
| `false` | **rejeitado** pela validação (BUSI-040)

> `dist/theme.css` é lido **pronto** pelo container — nada compila SCSS ou
> Tailwind dentro da imagem. O arquivo existe no host e só chega em
> produção quando a imagem é reconstruída: `okcms theme:build` seguido de
> `okcms redeploy`.

## Fluxo de desenvolvimento

```bash
# 1. Crie
npx okcms theme:create --name meu-tema --style scss

# 2. Edite os templates *.astro na raiz e os estilos

# 3. Compile os estilos (scss/tailwind)
npx okcms theme:build --name meu-tema

# 4. Ative (grava activeTheme no okcms.config.json)
npx okcms theme:manage --name meu-tema --set-active
#    (equivalente: ACTIVE_THEME=meu-tema no .env)
#    A tela Temas do admin também ativa — o tema ativo é lido do banco a
#    cada request, sem restart do site.

# 5. Gestão
npx okcms theme:list                               # instalados + status
npx okcms theme:manage -n meu-tema --info          # informações do theme.json
npx okcms theme:manage -n meu-tema --disable|enable
#    (estado local .okcms/extensions.json; o tema ativo é o --set-active)
npx okcms theme:manage -n meu-tema --uninstall
npx okcms theme:search -q blog                     # busca no npm (keyword okcms-theme)

# Se criou FORA do projeto:
npx okcms theme:install --name ../meu-tema-fonte

# 6. Depois de mudar templates/estilos: recompila e refaz o deploy
npx okcms theme:build --name meu-tema   # (o redeploy já compila sozinho)
npx okcms redeploy
```

## Publicando

Publique como pacote npm com a keyword `okcms-theme` (alvo do
`okcms theme:search`) e mantenha `compatibility.okcms` na linha suportada
do CMS. O `theme:build` deve ser executado no seu processo de release para
que `dist/theme.css` vá junto no pacote.
