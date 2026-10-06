import { createSignal, Show, onMount, onCleanup } from 'solid-js';
import { useTranslation } from '../../i18n';

interface Props {
  panels: Array<{
    id: string;
    label: string;
    defaultOpen?: boolean;
  }>;
}

const STORAGE_KEY = 'screen-options';

/** Preferências salvas (localStorage) — precedem o default do painel. */
function loadPrefs(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function ScreenOptions(props: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = createSignal(false);
  // Avaliação imediata: Solid NÃO trata função como valor lazy (seria o próprio valor)
  const [enabled, setEnabled] = createSignal<Record<string, boolean>>({
    ...Object.fromEntries(props.panels.map((p) => [p.id, p.defaultOpen !== false])),
    ...loadPrefs(),
  });

  const toggle = () => setOpen(!open());

  const togglePanel = (id: string, checked: boolean) => {
    const next = { ...enabled(), [id]: checked };
    setEnabled(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage indisponível (modo privado) — aplica só nesta sessão
    }
    window.dispatchEvent(new CustomEvent('screen-options-change', { detail: next }));
  };

  const handleClickOutside = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest('.screen-options')) {
      setOpen(false);
    }
  };

  // Um único listener global (antes: um novo a cada clique — vazamento)
  onMount(() => {
    document.addEventListener('click', handleClickOutside);
  });

  onCleanup(() => {
    document.removeEventListener('click', handleClickOutside);
  });

  return (
    <>
      <div class="screen-options">
        <button
          class="screen-options-trigger"
          onClick={toggle}
          aria-expanded={open()}
          aria-label={t('screenOptions.label')}
          type="button"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M6 9l6 6 6-6"/>
          </svg>
          <span>{t('screenOptions.title')}</span>
          <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>

        <Show when={open()}>
          <div class="screen-options-panel" role="region" aria-label={t('screenOptions.title')}>
            <div class="screen-options-header">
              <h3>{t('screenOptions.title')}</h3>
              <button class="screen-options-close" onClick={toggle} aria-label={t('common.close')} type="button">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div class="screen-options-content">
              <fieldset>
                <legend>{t('screenOptions.showOnScreen')}</legend>
                <div class="screen-options-checkboxes">
                  {props.panels.map((panel) => (
                    <label class="screen-options-checkbox">
                      <input
                        type="checkbox"
                        checked={enabled()[panel.id] ?? panel.defaultOpen !== false}
                        onChange={(e) => togglePanel(panel.id, e.currentTarget.checked)}
                      />
                      <span>{panel.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div class="screen-options-footer">
                <button class="btn btn-primary" onClick={toggle}>
                  {t('common.close')}
                </button>
              </div>
            </div>
          </div>
        </Show>
      </div>

      <style>{`
        .screen-options { position: relative; }
        .screen-options-trigger {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.375rem 0.75rem;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text);
          font-size: 0.8125rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }
        .screen-options-trigger:hover {
          background: var(--color-surface-hover);
          border-color: var(--color-primary);
        }
        .screen-options-trigger .chevron {
          transition: transform 0.15s;
          flex-shrink: 0;
        }
        .screen-options-trigger[aria-expanded="true"] .chevron {
          transform: rotate(180deg);
        }
        .screen-options-panel {
          position: absolute;
          top: calc(100% + 0.5rem);
          right: 0;
          min-width: 280px;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-xl);
          z-index: 1000;
          animation: slideIn 0.15s ease-out;
        }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-0.5rem); } to { opacity: 1; transform: translateY(0); } }
        .screen-options-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem;
          border-bottom: 1px solid var(--color-border);
        }
        .screen-options-header h3 { font-size: 0.875rem; font-weight: 600; }
        .screen-options-close {
          background: none; border: none; padding: 0.25rem;
          color: var(--color-muted); cursor: pointer; border-radius: var(--radius-sm);
        }
        .screen-options-close:hover { background: var(--color-background); color: var(--color-text); }
        .screen-options-content { padding: 1rem; }
        .screen-options-content fieldset { border: none; margin: 0; padding: 0; }
        .screen-options-content legend {
          font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
          color: var(--color-muted); letter-spacing: 0.04em; margin-bottom: 0.75rem;
        }
        .screen-options-checkboxes { display: flex; flex-direction: column; gap: 0.5rem; }
        .screen-options-checkbox {
          display: flex; align-items: center; gap: 0.5rem;
          padding: 0.5rem; border-radius: var(--radius-md);
          cursor: pointer; transition: background 0.15s;
        }
        .screen-options-checkbox:hover { background: var(--color-background); }
        .screen-options-checkbox input { width: 16px; height: 16px; accent-color: var(--color-primary); }
        .screen-options-checkbox span { font-size: 0.8125rem; color: var(--color-text); }
        .screen-options-footer { display: flex; justify-content: flex-end; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--color-border); }
      `}</style>
    </>
  );
}