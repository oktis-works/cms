---
"@oktis-works/admin": patch
---

Logo oficial em todos os pontos da UI (favicon, admin bar, sidebar e login).

- Novo `public/logo.svg`: SVG original do CorelDRAW com cores e paths
  preservados; apenas o `viewBox` foi ajustado para o caixa real da arte
  (`44817.69 -304.8 30309.6 30309.6`) — o export A4 colocava a arte fora
  do viewBox antigo (`0 0 21000 29700`) e nada aparecia.
- `favicon.svg` agora é a logo oficial (era um mark placeholder dourado).
- Admin bar, sidebar colapsada e login passam a usar `<img src="/logo.svg">`
  no lugar dos SVGs inline antigos, com os tamanhos de cada contexto
  (28px na barra/sidebar, 48px no login).
