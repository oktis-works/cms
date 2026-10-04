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

Sintaxe de template com variáveis e laços:

```html
<main class="site">
  {{#each posts}}
    <article>
      <h2>{{this.title}}</h2>
      <p>{{this.excerpt}}</p>
    </article>
  {{/each}}
</main>
```

- `templates/index.html` — listagem (ex.: `{{#each posts}}`)
- `templates/single.html` — item individual (ex.: `{{title}}`, `{{content}}`)

## Estilos por engine

| `--style` | Arquivo gerado | Build |
|---|---|---|
| `css` (default) | `style.css` | nenhum — servido direto |
| `scss` | `styles/main.scss` (+ `components.scss`) | `okcms theme:build -n meu-tema` |
| `tailwind` | `src/input.css` + `tailwind.config.js` | `okcms theme:build -n meu-tema` |

O build compila para `dist/theme.css` **com isolamento
`[data-theme="meu-tema"]`** (sem vazar estilos entre temas; o Tailwind já
sai com `preflight: false`).

> `dist/theme.css` é lido **pronto** pelo container — nada compila SCSS ou
> Tailwind dentro da imagem. O arquivo existe no host e só chega em
> produção quando a imagem é reconstruída: `okcms theme:build` seguido de
> `okcms redeploy`.

## Fluxo de desenvolvimento

```bash
# 1. Crie
npx okcms theme:create --name meu-tema --style scss

# 2. Edite templates/ e estilos

# 3. Compile os estilos (scss/tailwind)
npx okcms theme:build --name meu-tema

# 4. Ative (grava activeTheme no okcms.config.json)
npx okcms theme:manage --name meu-tema --set-active
#    (equivalente: ACTIVE_THEME=meu-tema no .env)

# 5. Gestão
npx okcms theme:list                               # instalados + status
npx okcms theme:manage -n meu-tema --info          # informações do theme.json
npx okcms theme:manage -n meu-tema --disable|enable
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
