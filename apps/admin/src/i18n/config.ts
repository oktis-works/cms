export type Locale = 
  | 'pt-BR' | 'en' | 'es-ES' 
  | 'ru' | 'uk' | 'tr' | 'he' | 'it' | 'pl' | 'zh-CN' | 'ja' 
  | 'ar' | 'sw' | 'yo' | 'zu' | 'am' | 'ha' | 'ig';

export const SUPPORTED_LOCALES: Locale[] = [
  'pt-BR', 'en', 'es-ES', 
  'ru', 'uk', 'tr', 'he', 'it', 'pl', 'zh-CN', 'ja', 
  'ar', 'sw', 'yo', 'zu', 'am', 'ha', 'ig'
];
export const DEFAULT_LOCALE: Locale = 'en';
export const FALLBACK_LOCALE: Locale = 'en';

// RTL (Right-to-Left) locales
export const RTL_LOCALES: Locale[] = ['he', 'ar'];

export const LOCALE_LABELS: Record<Locale, string> = {
  'pt-BR': 'Português (Brasil)',
  'en': 'English',
  'es-ES': 'Español',
  'ru': 'Русский',
  'uk': 'Українська',
  'tr': 'Türkçe',
  'he': 'עברית',
  'it': 'Italiano',
  'pl': 'Polski',
  'zh-CN': '中文 (简体)',
  'ja': '日本語',
  'ar': 'العربية',
  'sw': 'Kiswahili',
  'yo': 'Yorùbá',
  'zu': 'isiZulu',
  'am': 'አማርኛ',
  'ha': 'Hausa',
  'ig': 'Igbo'
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  'pt-BR': '🇧🇷',
  'en': '🇺🇸',
  'es-ES': '🇪🇸',
  'ru': '🇷🇺',
  'uk': '🇺🇦',
  'tr': '🇹🇷',
  'he': '🇮🇱',
  'it': '🇮🇹',
  'pl': '🇵🇱',
  'zh-CN': '🇨🇳',
  'ja': '🇯🇵',
  'ar': '🇸🇦',
  'sw': '🇹🇿',
  'yo': '🇳🇬',
  'zu': '🇿🇦',
  'am': '🇪🇹',
  'ha': '🇳🇬',
  'ig': '🇳🇬'
};

export function isValidLocale(locale: string): locale is Locale {
  return SUPPORTED_LOCALES.includes(locale as Locale);
}

export function isRTLLocale(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}