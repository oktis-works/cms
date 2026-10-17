// @oktis-works/admin - lib/api-proxy: forward de /api/* para a API (modo standalone)
//
// O `okcms dev`/`okcms start` sobe o Admin como build pré-compilado
// (dist/server/entry.mjs) — o `vite.server.proxy` do astro.config só existe em
// `astro dev`. Sem este middleware, PUBLIC_API_URL=/api (modo recomendado do
// scaffold) retornava 404 para TODO /api/* no Admin.
//
// Ativado apenas quando ADMIN_API_PROXY_TARGET está definido (mesma variável
// do modo dev do Vite), preservando cookies (Set-Cookie passa direto ao browser
// na origem do Admin) e streams (uploads/downloads).

/** Cabeçalhos hop-by-hop (e de identidade) que não podem ser repassados. */
const HOP_BY_HOP = new Set([
  'host',
  'connection',
  'content-length',
  'accept-encoding',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/**
 * Encaminha `request` (caminho /api/*) para `target` (ex.: http://localhost:3000)
 * e devolve a resposta da API como se o próprio Admin a tivesse servido.
 *
 * `clientAddress` (socket do browser contra o Admin) é repassado como
 * X-Forwarded-For/X-Real-IP: sem ele, a API enxergava o IP do próprio
 * processo do Admin e TODOS os usuários caíam no mesmo bucket de rate limit
 * — a causa direta do 429 em rajada. O valor é APENDIDO à cadeia existente,
 * então um XFF forjado pelo browser fica à esquerda e o rate limiter (que
 * caminha da direita) continua usando o hop real.
 */
export async function proxyApiRequest(
  target: string,
  request: Request,
  options?: { clientAddress?: string }
): Promise<Response> {
  const url = new URL(request.url);
  const upstream = new URL(url.pathname + url.search, `${target.replace(/\/$/, '')}/`);

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });

  const clientIp = options?.clientAddress?.trim();
  if (clientIp) {
    const existing = headers.get('X-Forwarded-For');
    headers.set('X-Forwarded-For', existing ? `${existing}, ${clientIp}` : clientIp);
    headers.set('X-Real-IP', clientIp);
  }

  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    // Passa o corpo como stream (JSON e multipart/upload sem bufferizar).
    init.body = request.body;
    init.duplex = 'half';
  }

  try {
    const upstreamRes = await fetch(upstream.toString(), init);

    const out = new Headers();
    upstreamRes.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'set-cookie') out.append(key, value);
    });
    // Set-Cookie precisa sair item a item (Headers dobra vírgulas e quebraria
    // expires; o undici expõe a lista via getSetCookie).
    const rawHeaders = upstreamRes.headers as Headers & { getSetCookie?: () => string[] };
    const setCookies = typeof rawHeaders.getSetCookie === 'function'
      ? rawHeaders.getSetCookie()
      : [];
    for (const cookie of setCookies) out.append('set-cookie', cookie);

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: out,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'API unreachable',
        message: `Proxy para ${upstream.origin} falhou: ${error instanceof Error ? error.message : String(error)}`,
      }),
      { status: 502, headers: { 'content-type': 'application/json' } }
    );
  }
}
