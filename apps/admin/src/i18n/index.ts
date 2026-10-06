import type { Locale, TranslationMap, TFunction } from './types';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, FALLBACK_LOCALE } from './config';
import { loadLocale } from './loaders';
import { changeLocale, resolveLocale } from './locale';
import { createSignal, onMount } from 'solid-js';

interface UseTranslationReturn {
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: Locale;
  changeLocale: (locale: Locale) => Promise<void>;
  loading: boolean;
}

// Cache de funções de tradução criadas
const tFunctionCache = new Map<Locale, TFunction>();

/** Cria função de tradução para um locale */
function createTFunction(translations: TranslationMap, fallback: TranslationMap): TFunction {
  return function t(key: string, params?: Record<string, string | number>): string {
    const keys = key.split('.');
    let value: unknown = translations;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        value = fallback;
        for (const k of keys) {
          if (value && typeof value === 'object' && k in value) {
            value = (value as Record<string, unknown>)[k];
          } else {
            return key;
          }
        }
        break;
      }
    }
    
    if (typeof value !== 'string') return key;
    
    if (params) {
      return value.replace(/\{(\w+)\}/g, (_, param) => String(params[param] ?? ''));
    }
    
    return value;
  };
}

/** Obtém ou cria função de tradução para locale */
export async function getTFunction(locale: Locale): Promise<TFunction> {
  if (tFunctionCache.has(locale)) return tFunctionCache.get(locale)!;
  
  const [translations, fallback] = await Promise.all([
    loadLocale(locale),
    loadLocale(FALLBACK_LOCALE)
  ]);
  
  const fn = createTFunction(translations, fallback);
  tFunctionCache.set(locale, fn);
  return fn;
}

// Estado global do i18n (não precisa de signal reativo complexo)
let currentTFunction: TFunction = (key: string) => key;
let currentLocale: Locale = DEFAULT_LOCALE;
let isLoading = true;

/** Hook Solid para usar traduções em componentes */
export function useTranslation(initialLocale?: Locale): UseTranslationReturn {
  const [, forceUpdate] = createSignal(0);
  
  onMount(async () => {
    if (isLoading) {
      const resolvedLocale = initialLocale ?? await resolveLocale();
      currentLocale = resolvedLocale;
      currentTFunction = await getTFunction(resolvedLocale);
      isLoading = false;
      forceUpdate(n => n + 1);
    }
  });
  
  const changeLocaleFn = async (newLocale: Locale) => {
    isLoading = true;
    await changeLocale(newLocale);
    currentLocale = newLocale;
    currentTFunction = await getTFunction(newLocale);
    isLoading = false;
    forceUpdate(n => n + 1);
  };
  
  // Função de tradução que usa o estado global
  const translate = (key: string, params?: Record<string, string | number>) => 
    currentTFunction(key, params);
  
  return { 
    t: translate, 
    get locale(): Locale { return currentLocale; }, 
    changeLocale: changeLocaleFn, 
    get loading(): boolean { return isLoading; }
  };
}

/** Função síncrona para uso em Astro (server-side) - requer translations pré-carregadas */
export function createSyncTFunction(translations: TranslationMap, fallback: TranslationMap): TFunction {
  return createTFunction(translations, fallback);
}

/** Carrega traduções para uso em Astro middleware/pages */
export async function getTranslationsForLocale(locale: Locale): Promise<TranslationMap> {
  return loadLocale(locale);
}

/** Limpa cache (útil para testes) */
export function clearTranslationCache(): void {
  tFunctionCache.clear();
  currentTFunction = (key: string) => key;
  currentLocale = DEFAULT_LOCALE;
  isLoading = true;
}

// Exportar tipos e config
export * from './config';
export * from './types';
export * from './locale';
export * from './loaders';