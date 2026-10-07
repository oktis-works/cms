import type { Locale, TranslationMap, TFunction } from './types';
import { DEFAULT_LOCALE, FALLBACK_LOCALE } from './config';
import { loadLocale } from './loaders';
import { changeLocale, resolveLocale } from './locale';
import { createSignal, onMount } from 'solid-js';
import englishTranslations from './locales/en.json';

interface UseTranslationReturn {
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: () => Locale;
  changeLocale: (locale: Locale) => Promise<void>;
  loading: boolean;
}

// Cache de funções de tradução criadas
const tFunctionCache = new Map<Locale, TFunction>();

// A renderização SSR/hidratação dos islands Solid acontece antes da carga
// assíncrona do locale. Mantemos inglês como fallback imediato para nunca
// expor chaves técnicas (por exemplo, "content.list.columns.title") na UI.
const initialTranslations = englishTranslations as TranslationMap;

// Todos os componentes que chamam `t` passam a reagir quando o locale termina
// de carregar ou muda pelo seletor de idioma.
const [translationVersion, notifyTranslationChange] = createSignal(0);
let translationLoadPromise: Promise<void> | null = null;

function humanizeKey(key: string): string {
  const lastSegment = key.split('.').at(-1) ?? key;
  return lastSegment
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

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
            return humanizeKey(key);
          }
        }
        break;
      }
    }
    
    if (typeof value !== 'string') return humanizeKey(key);
    
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
let currentTFunction: TFunction = createTFunction(initialTranslations, initialTranslations);
let currentLocale: Locale = DEFAULT_LOCALE;
let isLoading = true;

const LOCALE_CHANGE_EVENT = 'okcms:locale-changed';

function emitLocaleChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT, { detail: { locale: currentLocale } }));
  }
}

/** Hook Solid para usar traduções em componentes */
export function useTranslation(initialLocale?: Locale): UseTranslationReturn {
  onMount(async () => {
    if (!isLoading) return;

    if (!translationLoadPromise) {
      translationLoadPromise = (async () => {
        const resolvedLocale = initialLocale ?? await resolveLocale();
        currentLocale = resolvedLocale;
        currentTFunction = await getTFunction(resolvedLocale);
        isLoading = false;
        notifyTranslationChange((version) => version + 1);
        emitLocaleChange();
      })();
    }

    await translationLoadPromise;
  });
  
  const changeLocaleFn = async (newLocale: Locale) => {
    isLoading = true;
    currentLocale = newLocale;
    currentTFunction = await getTFunction(newLocale);
    isLoading = false;
    notifyTranslationChange((version) => version + 1);
    emitLocaleChange();
    await changeLocale(newLocale);
  };
  
  // Função de tradução que usa o estado global
  const translate = (key: string, params?: Record<string, string | number>) => {
    // Registra dependência reativa para que textos usados diretamente no JSX
    // sejam atualizados depois do carregamento assíncrono.
    translationVersion();
    return currentTFunction(key, params);
  };
  
  return { 
    t: translate, 
    locale: () => {
      translationVersion();
      return currentLocale;
    },
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
  currentTFunction = createTFunction(initialTranslations, initialTranslations);
  currentLocale = DEFAULT_LOCALE;
  isLoading = true;
  translationLoadPromise = null;
  notifyTranslationChange((version) => version + 1);
}

// Exportar tipos e config
export * from './config';
export * from './types';
export * from './locale';
export * from './loaders';
