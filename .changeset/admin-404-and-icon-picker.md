---
"@oktis-works/admin": minor
---

feat(admin): página 404 com a marca OkCMS e seletor de ícones virtualizado

Página 404 própria (removendo a genérica do Astro) com o logo horizontal,
caminho solicitado, sugestões sutis de navegação e "Voltar ao início" —
traduzida nos 14 idiomas, com suporte a RTL (ar/he).

Em `/settings/post-types`, o campo "Ícone do menu lateral" deixa de aceitar
texto livre e passa a ser um dropdown com preview do ícone Lucide escolhido:
busca, contagem de resultados e o catálogo completo (~2.100 ícones) renderizado
com virtualização (54 células no DOM), sem lag de digitação.
