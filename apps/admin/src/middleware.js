// @ts-expect-error astro:middleware só resolve no build do Astro, não no tsc raiz
import { defineMiddleware } from 'astro:middleware';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, isRTLLocale } from './i18n/config';
import { getTranslationsForLocale } from './i18n';
import { proxyApiRequest } from './lib/api-proxy';
/** Lê um cookie do header Cookie da requisição. */
function readRequestCookie(cookieHeader, name) {
    for (const part of cookieHeader.split(';')) {
        const [key, ...rest] = part.trim().split('=');
        if (key === name)
            return decodeURIComponent(rest.join('='));
    }
    return null;
}
/**
 * Cache do /auth/me no processo, keyed pelo próprio access token.
 *
 * O JWT muda a cada refresh, então o cache se invalida sozinho quando a
 * sessão é renovada. TTL curto (60s) apenas absorve a navegação em rajada:
 * sem isto, cada página do admin dispararia um /auth/me server-side.
 */
const SESSION_CACHE_TTL_MS = 60_000;
const SESSION_CACHE_MAX = 500;
const sessionCache = new Map();
async function fetchSsrSession(apiUrl, accessToken) {
    const now = Date.now();
    const cached = sessionCache.get(accessToken);
    if (cached && cached.expiresAt > now)
        return { user: cached.user, ok: cached.ok };
    let user = null;
    let ok = false;
    try {
        const res = await fetch(`${apiUrl}/api/v1/auth/me`, {
            credentials: 'include',
            headers: { Cookie: `access_token=${accessToken}` },
        });
        if (res.ok) {
            const data = await res.json();
            user = data.user ?? null;
            ok = true;
        }
    }
    catch {
        // API indisponível: o cliente decide (checkSession) — nunca o SSR chuta.
    }
    if (sessionCache.size >= SESSION_CACHE_MAX) {
        const oldest = sessionCache.keys().next().value;
        if (oldest !== undefined)
            sessionCache.delete(oldest);
    }
    sessionCache.set(accessToken, { user, ok, expiresAt: now + SESSION_CACHE_TTL_MS });
    return { user, ok };
}
/** Base absoluta da API para os fetches de servidor (proxy relativo vira alvo real). */
function resolveServerApiUrl() {
    let base = import.meta.env.PUBLIC_API_URL?.trim()
        || (typeof process !== 'undefined' ? process.env['PUBLIC_API_URL']?.trim() : '')
        || '';
    base = base.replace(/\/$/, '');
    if (base && !/^https?:\/\//i.test(base)) {
        const target = (typeof process !== 'undefined' ? process.env['ADMIN_API_PROXY_TARGET']?.trim() : '') || '';
        base = target ? `${target.replace(/\/$/, '')}${base}` : '';
    }
    return base || 'http://localhost:3000';
}
function humanizeTranslationKey(key) {
    const lastSegment = key.split('.').at(-1) ?? key;
    return lastSegment
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\w/, (letter) => letter.toUpperCase());
}
/** Cria função de tradução que NUNCA falha — retorna a chave se não achar. */
function createTFunctionFromMap(map, fallback) {
    return (key, params) => {
        const keys = key.split('.');
        let value = map;
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            }
            else {
                value = fallback;
                for (const k of keys) {
                    if (value && typeof value === 'object' && k in value) {
                        value = value[k];
                    }
                    else
                        return humanizeTranslationKey(key);
                }
                break;
            }
        }
        if (typeof value !== 'string')
            return humanizeTranslationKey(key);
        if (params)
            return value.replace(/\{(\w+)\}/g, (_, p) => String(params[p] ?? ''));
        return value;
    };
}
/** Fallback mínimo se TUDO falhar — garante que `t` SEMPRE seja função. */
function createFallbackT() {
    return (key) => key;
}
export const onRequest = defineMiddleware(async (context, next) => {
    // 0. Proxy /api/* → API quando ADMIN_API_PROXY_TARGET está definido.
    //    O `okcms dev/start` roda o Admin como build pré-compilado (standalone),
    //    onde o vite.server.proxy do astro.config não existe — sem isto, o modo
    //    recomendado do scaffold (PUBLIC_API_URL=/api) respondia 404 em todo
    //    /api/* (login incluso). Curto-circuito antes do i18n (que faria fetch).
    const proxyTarget = (typeof process !== 'undefined' ? process.env['ADMIN_API_PROXY_TARGET']?.trim() : '') || '';
    if (proxyTarget) {
        const pathname = new URL(context.request.url).pathname;
        if (pathname === '/api' || pathname.startsWith('/api/')) {
            // clientAddress é o socket do browser contra o Admin. Repassado ao
            // proxy como X-Forwarded-For para que o rate limiter da API identifique
            // o usuário real em vez de bucketar todo mundo pelo IP do Admin.
            let clientAddress;
            try {
                clientAddress = context.clientAddress;
            }
            catch {
                // adapter sem suporte a clientAddress: a API fica com o IP do proxy.
            }
            return proxyApiRequest(proxyTarget, context.request, { clientAddress });
        }
    }
    // SEMPRE define um `t` válido ANTES de qualquer await — evita "t is not a function"
    // se houver erro na carga de traduções, na fetch da API, etc.
    context.locals.t = createFallbackT();
    context.locals.locale = DEFAULT_LOCALE;
    context.locals.isRTL = false;
    try {
        const cookieHeader = context.request.headers.get('Cookie') ?? '';
        const cookieLocale = readRequestCookie(cookieHeader, 'admin_locale');
        const accessToken = readRequestCookie(cookieHeader, 'access_token');
        // 1. Sessão no SSR: UMA chamada devolve usuário + locale + papéis. Antes
        //    cada página fazia /users/me/locale (server) + /auth/me (guard) +
        //    /auth/me (admin bar) = 3 requisições para o mesmo dado.
        let userLocale = null;
        if (accessToken) {
            const apiUrl = resolveServerApiUrl();
            const { user, ok } = await fetchSsrSession(apiUrl, accessToken);
            context.locals.user = user;
            context.locals.sessionState = ok ? 'authenticated' : 'unavailable';
            userLocale = user?.locale ?? null;
        }
        else {
            // Sem access_token não há sessão a verificar: o cliente redireciona
            // sem gastar nenhuma requisição (era um /auth/me só para ouvir 401).
            context.locals.user = null;
            context.locals.sessionState = 'anonymous';
        }
        // 2. Accept-Language header
        const acceptLang = context.request.headers.get('Accept-Language');
        const browserLocale = acceptLang?.split(',')[0]?.split('-')[0] ?? DEFAULT_LOCALE;
        // Resolver locale final. O cookie é autoritativo (quem o grava é o
        // próprio middleware e o seletor de idioma do admin) — o fetch ao banco
        // que existia em TODA requisição só rodava quando o cookie faltava, e o
        // resultado era descartado em seguida.
        const locale = (cookieLocale ?? userLocale ?? browserLocale);
        const validLocale = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
        // Carregar traduções para uso nas páginas Astro
        const [translations, fallback] = await Promise.all([
            getTranslationsForLocale(validLocale),
            getTranslationsForLocale(DEFAULT_LOCALE)
        ]);
        // Substitui o fallback pelo t real (com traduções carregadas)
        context.locals.t = createTFunctionFromMap(translations, fallback);
        context.locals.locale = validLocale;
        context.locals.isRTL = isRTLLocale(validLocale);
        // Definir cookie se não existir
        if (!cookieLocale) {
            context.cookies.set('admin_locale', validLocale, { path: '/', maxAge: 31536000, sameSite: 'lax' });
        }
    }
    catch (e) {
        // Se QUALQUER coisa falhar (fetch, getTranslationsForLocale, etc.),
        // o `t` já é uma função válida (createFallbackT) — a UI carrega sem travar.
        // A sessão fica `unavailable` (nunca `anonymous`): um problema de rede no
        // servidor não pode ser interpretado como "usuário deslogado".
        context.locals.sessionState = context.locals.sessionState ?? 'unavailable';
        console.warn('[i18n middleware] fallback ativo:', e instanceof Error ? e.message : e);
    }
    return next();
});
//# sourceMappingURL=middleware.js.map