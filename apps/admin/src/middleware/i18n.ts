// @ts-expect-error astro:middleware só resolve no build do Astro, não no tsc raiz
import { defineMiddleware } from 'astro:middleware';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, isRTLLocale } from '../i18n/config';
import { getTranslationsForLocale } from '../i18n';

// Type definitions for Astro middleware (not available in TS environment)
interface AstroContext {
  cookies: {
    get: (name: string) => { value: string } | undefined;
    set: (name: string, value: string, options: { path: string; maxAge: number; sameSite: string }) => void;
  };
  locals: {
    runtime?: { env?: Record<string, string> };
    t?: (key: string, params?: Record<string, string | number>) => string;
    locale?: string;
    isRTL?: boolean;
  };
  request: Request;
}

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
          } else return key;
        }
        break;
      }
    }
    if (typeof value !== 'string') return key;
    if (params) return value.replace(/\{(\w+)\}/g, (_, p) => String(params[p] ?? ''));
    return value;
  };
}

export const i18nMiddleware = defineMiddleware(async (context: AstroContext, next: () => Promise<Response>) => {
  // 1. Tentar obter do cookie
  const cookieLocale = context.cookies.get('admin_locale')?.value;
  
  // 2. Tentar obter do usuário logado (via API)
  let userLocale: string | null = null;
  try {
    const apiUrl = context.locals.runtime?.env?.['PUBLIC_API_URL'] ?? 'http://localhost:3000';
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
  
  context.locals.t = createTFunctionFromMap(translations, fallback);
  context.locals.locale = validLocale;
  context.locals.isRTL = isRTLLocale(validLocale as any);
  
  // Definir cookie se não existir
  if (!cookieLocale) {
    context.cookies.set('admin_locale', validLocale, { path: '/', maxAge: 31536000, sameSite: 'lax' });
  }
  
  return next();
});