export const SUPPORTED_LOCALES = [
    'pt-BR', 'en', 'es-ES',
    'ru', 'uk', 'tr', 'he', 'it', 'pl', 'zh-CN', 'ja',
    'ar', 'sw', 'yo', 'zu', 'am', 'ha', 'ig'
];
export const DEFAULT_LOCALE = 'en';
export const FALLBACK_LOCALE = 'en';
// RTL (Right-to-Left) locales
export const RTL_LOCALES = ['he', 'ar'];
export const LOCALE_LABELS = {
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
export const LOCALE_FLAGS = {
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
export function isValidLocale(locale) {
    return SUPPORTED_LOCALES.includes(locale);
}
export function isRTLLocale(locale) {
    return RTL_LOCALES.includes(locale);
}
//# sourceMappingURL=config.js.map