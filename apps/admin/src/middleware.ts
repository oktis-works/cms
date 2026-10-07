// @ts-expect-error astro:middleware só resolve no build do Astro, não no tsc raiz
import { defineMiddleware } from 'astro:middleware';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, isRTLLocale } from './i18n/config';
import { getTranslationsForLocale } from './i18n';

// Type definitions for Astro middleware (not available in TS environment)
interface AstroContext {
  cookies: {
    get: (name: string) => { value: string } | undefined;
    set: (name: string, value: string, options: { path: string; maxAge: number; sameSite: string }) => void;
  };
  locals: {
    t?: (key: string, params?: Record<string, string | number>) => string;
    locale?: string;
    isRTL?: boolean;
  };
  request: Request;
}

function humanizeTranslationKey(key: string): string {
  const lastSegment = key.split('.').at(-1) ?? key;
  return lastSegment
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

/** Cria função de tradução que NUNCA falha — retorna a chave se não achar. */
function createTFunctionFromMap(map: Record<string, unknown>, fallback: Record<string, unknown>) {
  return (key: string, params?: Record<string, string | number>) => {
    const keys = key.split('.');
    let value: unknown = map;
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        value = fallback;
        for (const k of keys) {
          if (value && typeof value === 'object' && k in value) {
            value = (value as Record<string, unknown>)[k];
          } else return humanizeTranslationKey(key);
        }
        break;
      }
    }
    if (typeof value !== 'string') return humanizeTranslationKey(key);
    if (params) return value.replace(/\{(\w+)\}/g, (_, p) => String(params[p] ?? ''));
    return value;
  };
}

/** Fallback mínimo se TUDO falhar — garante que `t` SEMPRE seja função. */
function createFallbackT(): (key: string) => string {
  return (key: string) => key;
}

export const onRequest = defineMiddleware(async (context: AstroContext, next: () => Promise<Response>) => {
  // SEMPRE define um `t` válido ANTES de qualquer await — evita "t is not a function"
  // se houver erro na carga de traduções, na fetch da API, etc.
  context.locals.t = createFallbackT();
  context.locals.locale = DEFAULT_LOCALE;
  context.locals.isRTL = false;

  try {
    // 1. Tentar obter do cookie
    const cookieLocale = context.cookies.get('admin_locale')?.value;
    
    // 2. Tentar obter do usuário logado (via API)
    let userLocale: string | null = null;
    try {
      // Em Astro, env vars estão disponíveis via import.meta.env
      const apiUrl = import.meta.env.PUBLIC_API_URL?.trim()
        || (typeof process !== 'undefined' ? process.env['PUBLIC_API_URL']?.trim() : '')
        || 'http://localhost:3000';
      const res = await fetch(`${apiUrl}/api/v1/users/me/locale`, {
        credentials: 'include',
        headers: { Cookie: context.request.headers.get('Cookie') ?? '' }
      });
      if (res.ok) userLocale = (await res.json()).locale;
    } catch {}
    
    // 3. Accept-Language header
    const acceptLang = context.request.headers.get('Accept-Language');
    const browserLocale = acceptLang?.split(',')[0]?.split('-')[0] ?? DEFAULT_LOCALE;
    
    // Resolver locale final
    const locale = (cookieLocale ?? userLocale ?? browserLocale) as string;
    const validLocale = SUPPORTED_LOCALES.includes(locale as any) ? locale : DEFAULT_LOCALE;
    
    // Carregar traduções para uso nas páginas Astro
    const [translations, fallback] = await Promise.all([
      getTranslationsForLocale(validLocale as any),
      getTranslationsForLocale(DEFAULT_LOCALE)
    ]);
    
    // Substitui o fallback pelo t real (com traduções carregadas)
    context.locals.t = createTFunctionFromMap(translations, fallback);
    context.locals.locale = validLocale;
    context.locals.isRTL = isRTLLocale(validLocale as any);
    
    // Definir cookie se não existir
    if (!cookieLocale) {
      context.cookies.set('admin_locale', validLocale, { path: '/', maxAge: 31536000, sameSite: 'lax' });
    }
  } catch (e) {
    // Se QUALQUER coisa falhar (fetch, getTranslationsForLocale, etc.),
    // o `t` já é uma função válida (createFallbackT) — a UI carrega sem travar.
    console.warn('[i18n middleware] fallback ativo:', e instanceof Error ? e.message : e);
  }
  
  return next();
});
