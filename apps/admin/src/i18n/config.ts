export type Locale = 'pt-BR' | 'en' | 'es-ES';

export const SUPPORTED_LOCALES: Locale[] = ['pt-BR', 'en', 'es-ES'];
export const DEFAULT_LOCALE: Locale = 'pt-BR';
export const FALLBACK_LOCALE: Locale = 'en';

export const LOCALE_LABELS: Record<Locale, string> = {
  'pt-BR': 'Português (Brasil)',
  'en': 'English',
  'es-ES': 'Español'
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  'pt-BR': '🇧🇷',
  'en': '🇺🇸',
  'es-ES': '🇪🇸'
};

export function isValidLocale(locale: string): locale is Locale {
  return SUPPORTED_LOCALES.includes(locale as Locale);
}