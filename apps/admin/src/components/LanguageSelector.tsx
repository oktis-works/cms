import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import { useTranslation } from '../i18n';
import { SUPPORTED_LOCALES, LOCALE_LABELS, LOCALE_FLAGS } from '../i18n/config';
import type { Locale } from '../i18n/config';
import { isServer } from 'solid-js/web';

export function LanguageSelector() {
  const { locale, changeLocale, t } = useTranslation();
  const [open, setOpen] = createSignal(false);

  const handleClickOutside = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest('.language-selector')) {
      setOpen(false);
    }
  };

  // Adiciona listener após mount (client-side only)
  onMount(() => {
    if (isServer) return;
    document.addEventListener('click', handleClickOutside);
  });

  onCleanup(() => {
    if (isServer) return;
    document.removeEventListener('click', handleClickOutside);
  });

  const currentLocale = locale as Locale;
  const translate = t as (key: string, params?: Record<string, string | number>) => string;

  return (
    <div class="language-selector" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        class="btn btn-secondary btn-sm language-trigger"
        onClick={(e) => { e.stopPropagation(); setOpen(!open()); }}
        aria-expanded={open()}
        aria-label={translate('common.language') ?? 'Language'}
        type="button"
      >
        <span class="flag">{LOCALE_FLAGS[currentLocale] ?? '🌐'}</span>
        <span>{LOCALE_LABELS[currentLocale] ?? currentLocale}</span>
        <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <Show when={open()}>
        <ul class="language-dropdown" role="menu" aria-label={translate('common.language') ?? 'Language'}>
          {SUPPORTED_LOCALES.map((loc) => (
            <li role="menuitem">
              <button
                class={currentLocale === loc ? 'active' : ''}
                onClick={() => { changeLocale(loc); setOpen(false); }}
                type="button"
              >
                <span class="flag">{LOCALE_FLAGS[loc] ?? '🌐'}</span>
                {LOCALE_LABELS[loc] ?? loc}
              </button>
            </li>
          ))}
        </ul>
      </Show>

      <style>{`
        .language-selector { position: relative; }
        .language-trigger { display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0.75rem; min-width: 140px; justify-content: space-between; }
        .language-trigger .flag { font-size: 1rem; }
        .language-trigger .chevron { flex-shrink: 0; transition: transform 0.15s; }
        .language-trigger[aria-expanded="true"] .chevron { transform: rotate(180deg); }
        .language-dropdown { position: absolute; top: calc(100% + 0.25rem); right: 0; z-index: 100; background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); min-width: 160px; overflow: hidden; animation: dropdown-in 0.1s ease-out; }
        @keyframes dropdown-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        .language-dropdown li { list-style: none; }
        .language-dropdown button { width: 100%; display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background: none; border: none; text-align: left; color: var(--color-text); cursor: pointer; }
        .language-dropdown button:hover { background: var(--color-bg-tertiary); }
        .language-dropdown button.active { background: var(--color-primary); color: var(--color-primary-contrast); font-weight: 500; }
        .language-dropdown .flag { font-size: 1rem; }
      `}</style>
    </div>
  );
}