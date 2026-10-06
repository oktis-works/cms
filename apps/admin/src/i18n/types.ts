import type { Locale } from './config';

export type { Locale };

export interface TranslationMap {
  [key: string]: string | TranslationMap;
}

export interface TFunction {
  (key: string, params?: Record<string, string | number>): string;
}

export interface LocaleConfig {
  supportedLocales: Locale[];
  defaultLocale: Locale;
  fallbackLocale: Locale;
}

export interface UseTranslationReturn {
  t: TFunction;
  locale: Locale;
  changeLocale: (locale: Locale) => Promise<void>;
}

export interface PluginI18nManifest {
  defaultLocale: Locale;
  locales: Locale[];
  namespace: string;
}