---
"@oktis-works/api": minor
"@oktis-works/admin": minor
"@oktis-works/config": minor
"@oktis-works/cms": patch
---

fix(rate-limit): 429 em rajada e "logout" falso no admin

O admin estourava o rate limit carregando o dashboard (~21 requisições por
página, com N+1 e /auth/me triplicado) e todos os clientes dividiam um único
balde `platform:unknown` — a chave vinha de X-Forwarded-For forjável ou
retornava literalmente "unknown". O guarda de sessão trataba qualquer erro
(inclusive 429) como "usuário deslogado" e redirecionava para /login.

API:
- rate limiting por classe: anônimo por IP real (socket, ou XFF apenas
  quando o par é proxy de confiança; `TRUST_PROXY`/`TRUSTED_PROXIES`),
  autenticado por user id da sessão (JWT verificado, sem banco) e
  credenciais com limiter dedicado por IP + e-mail (10 tentativas / 5min);
- `X-Tenant-ID` e `X-Forwarded-For` deixam de compor a chave (bypass);
- escritas custam 5x, mídia estática e bootstrap de CSRF são isentos,
  buckets expirados são varridos e há teto de chaves vivas;
- `RATE_LIMIT_WINDOW_SECONDS` é o nome canônico (`_MS` vira alias legado);
- cookie `session_expires_at` (não HttpOnly) emitido em login/refresh e
  `/auth/me` devolve `locale` (sessão + idioma em uma chamada);
- `GET /content?include=author` expande autores em uma query (anti N+1);
- nginx: X-Real-IP/X-Forwarded-For também em `/storage/` e `/themes/`.

Admin:
- `ApiError` tipado e `checkSession()` tri-estado: só um 401 definitivo
  redireciona; 429/5xx/rede viram `unavailable` (sem logout falso);
- 429 sinalizado na UI com aviso, e leituras repetem uma vez após o
  `Retry-After` curto (nada trava a interface);
- refresh proativo do access token via cookie `session_expires_at`;
- lock de refresh entre abas acorda pelo `storage` event (antes: polling
  com TTL de 10s que travava abas órfãs);
- sessão e idioma resolvidos no SSR (uma chamada server-side; o login
  não gasta nenhuma), CSRF em memória por 60s, proxy injeta o IP real.

Config/CLI:
- `RATE_LIMIT_DEFAULTS` em `@oktis-works/config` como fonte única; o wizard
  grava os mesmos defaults que a API lê (antes: wizard escrevia 100/60s e o
  código lia 300/60s com outro nome de variável).
