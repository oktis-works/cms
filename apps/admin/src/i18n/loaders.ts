import type { Locale, TranslationMap } from './types';
import { SUPPORTED_LOCALES } from './config';

const localeCache = new Map<Locale, TranslationMap>();

/** Carrega arquivo JSON de locale */
export async function loadLocale(locale: Locale): Promise<TranslationMap> {
  if (localeCache.has(locale)) return localeCache.get(locale)!;
  
  try {
    const module = await import(`../locales/${locale}.json`);
    const translations = module.default ?? module;
    localeCache.set(locale, translations);
    return translations;
  } catch {
    if (locale !== 'en') return loadLocale('en');
    return {};
  }
}

/** Pré-carrega todos os locales (para build) */
export async function preloadAllLocales(): Promise<void> {
  await Promise.all(SUPPORTED_LOCALES.map(loadLocale));
}

/** Limpa cache (útil para testes ou mudança de locale) */
export function clearLocaleCache(): void {
  localeCache.clear();
}