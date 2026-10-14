---
'@oktis-works/admin': patch
---

fix(login): proxy /api standalone, join sem prefixo duplicado, logo sem caixa dourado e favicon versionado

- **404 no login (`api/api/v1/auth/csrf`)**: o `okcms dev/start` roda o Admin como
  build pré-compilado, onde o `vite.server.proxy` não existe — o modo
  recomendado do scaffold (`PUBLIC_API_URL=/api`) respondia 404 em todo `/api/*`.
  Novo middleware `proxyApiRequest` encaminha `/api/*` para
  `ADMIN_API_PROXY_TARGET` (mesma variável do modo dev), preservando Set-Cookie,
  streams (uploads) e status; API fora do ar responde 502 JSON.
- **Join normalizado**: `joinApiUrl` remove a duplicação `/api` + `/api/v1/...`
  no client (`request`, `requestRaw`, csrf e uploads) e no fetch de locale do
  middleware (que também falhava com base relativa).
- **Login**: removido o caixa dourado ao redor da logo e o texto `OkCMS` (a
  wordmark já está no SVG); logo ampliada para 96px com alt acessível.
- **Favicon**: `href` com `?v=<versão>` — browsers guardam favicon pela URL;
  a cada release a URL muda e a logo oficial aparece sem limpar cache.
