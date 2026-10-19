// @oktis-works/plugin-runtime - api.http: cliente HTTP externo anti-SSRF
//
// Item 4 do plugin-parity-plan (+ Item 16 egress isolation). Camadas:
//
//   1. allowlist `httpPolicy.allowHosts` do manifesto (quando declarada);
//   2. apenas scheme http/https;
//   3. pré-validação DNS por HOP — TODOS os IPs resolvidos precisam ser
//      públicos (bloqueia RFC1918, loopback, link-local 169.254.169.254 =
//      metadata de cloud, CGNAT, multicast, ULA/link-local IPv6);
//   4. DNS pinning: o dispatcher (undici Agent) conecta exatamente no IP
//      validado (elimina a janela de DNS rebinding entre lookup e connect);
//   5. redirects `manual` com re-validação a cada hop (máx 3);
//   6. timeout por tentativa e teto de corpo;
//   7. retentativas apenas em erro de rede/5xx (GET/HEAD por padrão).
//
// Fail-closed: DNS que falha ou resolve em IP não-público NUNCA sobe a
// requisição, mesmo que o fetch do runtime ignorasse o dispatcher (Bun).

import { promises as dnsPromises } from 'node:dns';
import { Agent } from 'undici';
import { PERMISSIONS, type PluginHttpApi, type PluginHttpOptions, type PluginHttpResponse } from '@oktis-works/plugin-sdk';

export const DEFAULT_TIMEOUT_MS = 10_000;
export const MAX_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
export const MAX_REDIRECTS = 3;

export interface ResolvedAddress {
  address: string;
  family: number;
}

/** Erro de api.http com flag de retentativa. */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly retriable: boolean
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** IPv4 é rota pública? Fail-closed em qualquer faixa especial/reservada. */
export function isPublicIpv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const a = octets[0] ?? 0;
  const b = octets[1] ?? 0;
  const c = octets[2] ?? 0;

  if (a === 0) return false; // 0.0.0.0/8 "este host"
  if (a === 10) return false; // RFC1918
  if (a === 127) return false; // loopback
  if (a === 169 && b === 254) return false; // link-local = metadata cloud (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return false; // RFC1918
  if (a === 192 && b === 168) return false; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT RFC6598
  if (a === 192 && b === 0 && c === 0) return false; // RFC6890 IETF
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmark RFC2544
  if (a >= 224) return false; // multicast (224/4) + broadcast/reservado (240/4)
  return true;
}

/** IPv6 é rota pública? Fail-closed: só 2000::/3 (global unicast). */
export function isPublicIpv6(ip: string): boolean {
  const bare = (ip.split('%')[0] ?? '').toLowerCase();
  if (bare === '::' || bare === '::1') return false;

  // IPv4-mapped ::ffff:a.b.c.d → aplica as regras de IPv4
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(bare);
  if (mapped?.[1]) return isPublicIpv4(mapped[1]);

  // Compressão leading '::' fora do mapped → especial/deprecado → bloqueia
  if (bare.startsWith('::')) return false;

  const firstBlock = bare.split(':')[0] ?? '';
  if (firstBlock.includes('.')) return false; // v4-suffix não tratado acima
  const hextet = Number.parseInt(firstBlock, 16);
  if (Number.isNaN(hextet)) return false;

  // 2000::/3 = único bloco de global unicast designado
  return hextet >= 0x2000 && hextet <= 0x3fff;
}

/** Qualquer IP não-público na lista → falso. */
export function isPublicIp(ip: string): boolean {
  return ip.includes(':') ? isPublicIpv6(ip) : isPublicIpv4(ip);
}

/** Seleciona o primeiro endereço público (para pinning). Lança se nenhum. */
export function selectPublicAddresses(addresses: ResolvedAddress[]): ResolvedAddress {
  const safe = addresses.find((entry) => isPublicIp(entry.address));
  if (!safe) {
    throw new HttpError(
      `host resolves only to non-public address(es): ${addresses.map((entry) => entry.address).join(', ')}`,
      false
    );
  }
  return safe;
}

/**
 * Allowlist do manifesto: entrada exata ou `*.sufixo.com` (subdomínios — o
 * apex precisa de entrada própria). Lista vazia/ausente = qualquer host
 * (publicidade continua garantida pela validação de IP).
 */
export function isAllowedHost(hostname: string, allowHosts?: string[]): boolean {
  if (!allowHosts || allowHosts.length === 0) return true;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return allowHosts.some((entry) => {
    const pattern = entry.trim().toLowerCase();
    if (!pattern) return false;
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1); // ".sufixo.com"
      return host.endsWith(suffix) && host.length > suffix.length;
    }
    return host === pattern;
  });
}

type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

const defaultResolver: Resolver = async (hostname) => {
  const bare = hostname.replace(/^\[|\]$/g, '');
  const addresses = await dnsPromises.lookup(bare, { all: true, verbatim: true });
  return addresses.map((entry) => ({ address: entry.address, family: entry.family }));
};

/**
 * Lookup "puro" usado pelo undici Agent: resolve E valida no MESMO passo —
 * o IP devolvido é exatamente o que a conexão usa (pinning real, sem janela
 * de rebinding).
 */
export function createSafeLookup(resolve: Resolver = defaultResolver) {
  return (
    hostname: string,
    _options: unknown,
    callback: (err: NodeJS.ErrnoException | null, address?: string | never, family?: number) => void
  ): void => {
    resolve(hostname).then(
      (addresses) => {
        try {
          const safe = selectPublicAddresses(addresses);
          callback(null, safe.address, safe.family);
        } catch (error) {
          callback(error as NodeJS.ErrnoException);
        }
      },
      (error: unknown) => {
        callback(error as NodeJS.ErrnoException);
      }
    );
  };
}

let sharedAgent: Agent | null = null;

/** Dispatcher compartilhado com lookup validado (pinning). */
export function getSafeAgent(): Agent {
  if (!sharedAgent) {
    sharedAgent = new Agent({
      connect: {
        // Assinatura compatível com net.LookupFunction via cast estrutural
        lookup: createSafeLookup() as never,
      },
    });
  }
  return sharedAgent;
}

/** Valida um alvo antes de tocar a rede (scheme + allowlist + DNS público). */
export async function validateTargetUrl(rawUrl: string, allowHosts?: string[]): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new HttpError(`invalid URL: ${rawUrl}`, false);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(`scheme not allowed: ${url.protocol}`, false);
  }
  if (!isAllowedHost(url.hostname, allowHosts)) {
    throw new HttpError(`host "${url.hostname}" is not in httpPolicy.allowHosts`, false);
  }

  let addresses: ResolvedAddress[];
  try {
    addresses = await defaultResolver(url.hostname);
  } catch (error) {
    throw new HttpError(
      `DNS resolution failed for ${url.hostname}: ${error instanceof Error ? error.message : String(error)}`,
      false
    );
  }
  if (addresses.length === 0) {
    throw new HttpError(`no addresses for ${url.hostname}`, false);
  }
  // TODOS os IPs precisam ser públicos (round-robin com um IP privado também bloqueia)
  const unsafe = addresses.filter((entry) => !isPublicIp(entry.address));
  if (unsafe.length > 0) {
    throw new HttpError(
      `host ${url.hostname} resolves to non-public address(es): ${unsafe.map((entry) => entry.address).join(', ')}`,
      false
    );
  }
  return url;
}

async function readBodyCapped(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new HttpError(`response body exceeds limit of ${maxBytes} bytes`, false);
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
  const merged = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return merged.toString('utf8');
}

async function readResponse(response: Response, maxBytes: number): Promise<PluginHttpResponse> {
  const body = await readBodyCapped(response, maxBytes);
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return {
    status: response.status,
    ok: response.ok,
    headers,
    body,
    json<T = unknown>(): T {
      return JSON.parse(body) as T;
    },
  };
}

interface AttemptConfig {
  method: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
  maxBytes: number;
}

/** Executa a cadeia de redirects (cada hop revalidado) — 1 tentativa. */
async function runRedirects(
  rawUrl: string,
  allowHosts: string[] | undefined,
  config: AttemptConfig
): Promise<PluginHttpResponse> {
  let currentUrl = rawUrl;
  let method = config.method;
  let body = config.body;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const target = await validateTargetUrl(currentUrl, allowHosts);

    const fetchInit = {
      method,
      headers: config.headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
      redirect: 'manual' as const,
      signal: AbortSignal.timeout(config.timeoutMs),
      // Node/undici: conecta no IP validado (pinning). Runtimes que ignoram
      // `dispatcher` (Bun) ainda seguem protegidos pela pré-validação acima.
      dispatcher: getSafeAgent(),
    } as RequestInit & { dispatcher?: unknown };

    const response = await fetch(target.toString(), fetchInit);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return readResponse(response, config.maxBytes);
      if (hop === MAX_REDIRECTS) {
        throw new HttpError(`too many redirects (max ${MAX_REDIRECTS})`, false);
      }
      // Libera o corpo do redirect sem consumir
      await response.body?.cancel().catch(() => undefined);

      currentUrl = new URL(location, target).toString();
      if (
        response.status === 303 ||
        ((response.status === 301 || response.status === 302) && method === 'POST')
      ) {
        method = 'GET';
        body = undefined;
      }
      continue;
    }

    return readResponse(response, config.maxBytes);
  }

  throw new HttpError(`too many redirects (max ${MAX_REDIRECTS})`, false);
}

export interface HttpApiConfig {
  /** Allowlist estrita do manifesto (httpPolicy.allowHosts). */
  allowHosts?: string[];
  /** Gate de permissão (http:outbound) — injetado pelo PluginAPI factory. */
  requirePermission: (permission: string) => void;
}

export function createHttpApi(config: HttpApiConfig): PluginHttpApi {
  async function request(rawUrl: string, options: PluginHttpOptions = {}): Promise<PluginHttpResponse> {
    config.requirePermission(PERMISSIONS.HTTP_OUTBOUND);

    const method = (options.method ?? 'GET').toUpperCase();
    const timeoutMs = Math.min(Math.max(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1), MAX_TIMEOUT_MS);
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    const retries = options.retries ?? (method === 'GET' || method === 'HEAD' ? 2 : 0);
    const attemptConfig: AttemptConfig = {
      method,
      headers: options.headers,
      body: options.body,
      timeoutMs,
      maxBytes,
    };

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await runRedirects(rawUrl, config.allowHosts, attemptConfig);
        if (response.status >= 500 && attempt < retries) {
          lastError = new HttpError(`upstream ${response.status}`, true);
          await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        const retriable = error instanceof HttpError ? error.retriable : true; // rede/timeout
        if (!retriable || attempt >= retries) break;
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  return {
    request,
    get: (url, options) => request(url, { ...options, method: 'GET' }),
    post: (url, body, options) => request(url, { ...options, method: 'POST', body }),
  };
}
