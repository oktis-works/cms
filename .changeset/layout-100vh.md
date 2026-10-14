---
'@oktis-works/admin': patch
---

fix(layout): .layout em 100vh puro com offset da AdminBar aplicado dentro

- `.layout` agora usa `height: 100vh` (antes `calc(100vh - 46px)`) e o
  `padding-top: 46px` no `<html>` foi removido — o documento começa em y=0 e a
  barra fixa sobrepõe o topo.
- `.content-wrapper` (corpo de cada página): `height: calc(100% - 46px)` +
  `margin-top: 46px` (via `--admin-bar-h`), reservando a faixa da barra em
  todas as páginas do admin com uma regra só.
- `.sidebar` (e o estado colapsada) ganhou `padding-top` com a mesma
  compensação, para o conteúdo da sidebar não ficar sob a barra.
