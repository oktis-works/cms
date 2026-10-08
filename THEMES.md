# Theme data API

O tema não precisa fazer requisições HTTP manuais para montar páginas. Durante
cada requisição pública, o Web Runtime cria um provider ligado ao banco, carrega
os dados necessários e executa o tema dentro desse contexto.

## Fluxo de renderização

1. O runtime resolve a URL para home, conteúdo individual ou archive.
2. O conteúdo publicado é carregado e colocado no contexto atual.
3. O provider do tema é criado para aquela requisição.
4. Menus, content types, taxonomias, termos e settings são disponibilizados.
5. O template recebe os dados e o Theme SDK fornece as funções de consulta.

O provider é isolado com `AsyncLocalStorage`. Dados de uma requisição não são
compartilhados com outra requisição concorrente.

## Funções unificadas

As funções são exportadas por `@oktis-works/theme-sdk`:

```ts
import {
  getMenu,
  getMenus,
  getContent,
  getContentById,
  getContentBySlug,
  getContentType,
  getContentTypes,
  getTaxonomy,
  getTaxonomies,
  getTaxonomyTerms,
  getSettings,
  getSetting,
} from '@oktis-works/theme-sdk';
```

Todas as consultas são assíncronas e retornam Promises.

### Menus

```ts
const main = await getMenu('main'); // slug ou nome do menu
const menus = await getMenus();

for (const item of main?.items ?? []) {
  console.log(item.label, item.url, item.parentId);
}
```

Cada item possui, quando aplicável, `type`, `objectId`, `objectType`, `label`,
`url`, `parentId`, `order`, `target`, `cssClasses`, `attrTitle`, `xfn` e
`description`. Os itens são armazenados em lista plana; `parentId` representa a
hierarquia. Isso permite montar menus simples ou árvores profundas sem perder a
ordem.

### Conteúdo

```ts
const latest = await getContent({
  type: 'post',
  status: 'PUBLISHED',
  limit: 12,
  page: 1,
  search: 'cms',
  orderBy: 'published_at',
  order: 'desc',
});

const page = await getContentBySlug('sobre', 'page');
const sameContent = page?.data ?? page?.body ?? {};
```

`getContent()` retorna:

```ts
{
  data: [],
  total: 0,
  page: 1,
  limit: 20,
  pages: 0
}
```

Por segurança, as consultas públicas usam `PUBLISHED` como status padrão.
Também existem `getContentById()` e `getContentBySlug()`.

### Content types

```ts
const types = await getContentTypes();
const product = await getContentType('produto');

if (product?.hasArchive) {
  console.log(`Arquivo disponível em /${product.slug}`);
}
```

### Taxonomias e termos

```ts
const taxonomies = await getTaxonomies();
const category = await getTaxonomy('category');
const terms = await getTaxonomyTerms('category');
```

No conteúdo atual, os termos relacionados também aparecem enriquecidos em
`content._terms`, agrupados pelo slug da taxonomia.

### Settings

```ts
const settings = await getSettings();
const siteTitle = await getSetting('siteTitle', 'Meu site');
const general = await getSettings('general');
```

## Campos do conteúdo atual

Para o conteúdo que está sendo renderizado, o SDK já possui funções síncronas e
assíncronas:

```ts
import {
  getField,
  getFields,
  getFieldsAsync,
  getFlexibleLayouts,
} from '@oktis-works/theme-sdk';

const title = getField('title');
const price = getField('price');
const allFields = getFields();
const sections = getFlexibleLayouts('sections');
const filteredFields = await getFieldsAsync();
```

Campos padrão (`title`, `slug`, `excerpt`, `status`, SEO, mídia destacada etc.)
e campos personalizados são entregues pela mesma API. Um campo personalizado
com o mesmo nome tem prioridade sobre o campo nativo.

## Dados já disponíveis nos templates HTML

Os templates legados do OkCMS usam variáveis e `#each`. O runtime injeta:

```text
site
page
content
fields
items
menus
contentTypes
taxonomies
terms
settings
themeData
```

Exemplo de menu:

```html
<nav>
  {{#each menus.primary.items}}
    <a href="{{url}}">{{label}}</a>
  {{/each}}
</nav>
```

Exemplo de listagem:

```html
{{#each items}}
  <article>
    <h2><a href="/{{slug}}">{{title}}</a></h2>
    <p>{{excerpt}}</p>
  </article>
{{/each}}
```

Todos os menus também estão em `menus.all`, e a taxonomia pode ser percorrida
com `terms.category`, por exemplo:

```html
{{#each terms.category}}
  <a href="/category/{{slug}}">{{name}}</a>
{{/each}}
```

## Uso avançado

Em código server-side do tema, as funções podem ser combinadas:

```ts
const [menu, posts, products, settings] = await Promise.all([
  getMenu('primary'),
  getContent({ type: 'post', limit: 5 }),
  getContent({ type: 'produto', limit: 8, orderBy: 'title', order: 'asc' }),
  getSettings('general'),
]);
```

Para menus hierárquicos, agrupe os itens por `parentId` e ordene por `order`.
Para widgets e componentes reutilizáveis, passe o resultado dessas funções
como props; não é necessário conhecer as rotas `/api/v1`.

## Provider para integrações

O runtime oficial registra automaticamente o provider de banco. Plugins ou
ambientes especiais podem fornecer uma implementação compatível:

```ts
import {
  runWithThemeDataProvider,
  setThemeDataProvider,
  type ThemeDataProvider,
} from '@oktis-works/theme-sdk';
```

Uma implementação deve atender aos métodos de `ThemeDataProvider`. Use
`runWithThemeDataProvider(provider, fn)` para manter o provider isolado por
requisição. `setThemeDataProvider` existe para fallback global em processos
controlados; não use estado mutável global para dados específicos de usuários.

## Limites e segurança

- O tema recebe conteúdo público por padrão; rascunhos não são expostos sem
  solicitar explicitamente outro status em um ambiente controlado.
- As consultas passam pelo contexto de tenant estabelecido pelo Web Runtime.
- O tema não deve consultar diretamente o banco nem montar URLs internas da
  API.
- Dados externos devem ser escapados no template. Use interpolação normal para
  texto e a forma raw somente quando o valor for HTML confiável.
