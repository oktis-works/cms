import { apiClient } from '../lib/api';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from './config';
const LOCALE_COOKIE = 'admin_locale';
/** Obtém locale do cookie */
export function getCookieLocale() {
    if (typeof document === 'undefined')
        return null;
    const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]+)`));
    if (match?.[1] && SUPPORTED_LOCALES.includes(match[1])) {
        return match[1];
    }
    return null;
}
/** Define locale no cookie (1 ano) */
export function setCookieLocale(locale) {
    if (typeof document === 'undefined')
        return;
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}
/** Obtém locale do Accept-Language header */
export function getBrowserLocale() {
    if (typeof navigator === 'undefined')
        return DEFAULT_LOCALE;
    const lang = navigator.language?.split('-')[0]?.toLowerCase();
    const fullLang = navigator.language?.toLowerCase();
    for (const locale of SUPPORTED_LOCALES) {
        if (locale.toLowerCase() === fullLang || locale.split('-')[0] === lang) {
            return locale;
        }
    }
    return DEFAULT_LOCALE;
}
/** Obtém locale do usuário logado via API */
export async function getUserLocaleFromAPI() {
    try {
        const locale = await apiClient.getUserLocale();
        if (locale && SUPPORTED_LOCALES.includes(locale)) {
            return locale;
        }
    }
    catch { }
    return null;
}
/** Salva locale do usuário via API */
export async function setUserLocaleInAPI(locale) {
    await apiClient.setUserLocale(locale);
}
/** Resolve locale final com prioridade: cookie → user API → browser → default */
export async function resolveLocale() {
    const cookie = getCookieLocale();
    if (cookie)
        return cookie;
    const user = await getUserLocaleFromAPI();
    if (user)
        return user;
    const browser = getBrowserLocale();
    if (browser)
        return browser;
    return DEFAULT_LOCALE;
}
/** Muda locale (salva no cookie + API se logado) */
export async function changeLocale(locale) {
    setCookieLocale(locale);
    try {
        await setUserLocaleInAPI(locale);
    }
    catch {
        // Usuário não logado ou erro de rede - cookie já foi salvo
    }
}
//# sourceMappingURL=locale.js.map