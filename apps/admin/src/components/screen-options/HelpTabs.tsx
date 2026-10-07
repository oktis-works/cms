import { createSignal, Show, onMount, onCleanup } from 'solid-js';
import { useTranslation } from '../../i18n';
import { sanitizeHtml } from '../../lib/sanitize';
import { isServer } from 'solid-js/web';

interface HelpTab {
  id: string;
  label: string;
  content: string;
}

interface Props {
  tabs: HelpTab[];
}

export function HelpTabs(props: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = createSignal(false);
  const [activeTab, setActiveTab] = createSignal(props.tabs[0]?.id ?? '');

  const toggle = () => setOpen(!open());

  const handleClickOutside = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest('.help-tabs')) {
      setOpen(false);
    }
  };

  // Um único listener global (antes: um novo a cada clique — vazamento)
  onMount(() => {
    if (isServer) return;
    document.addEventListener('click', handleClickOutside);
  });

  onCleanup(() => {
    if (isServer) return;
    document.removeEventListener('click', handleClickOutside);
  });

  return (
    <div class="help-tabs-wrapper">
      <div class="help-tabs">
        <button
          class="help-tabs-trigger"
          onClick={toggle}
          aria-expanded={open()}
          aria-label={t('helpTabs.label')}
          type="button"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4M12 8h.01"/>
          </svg>
          <span>{t('helpTabs.title')}</span>
          <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>

        <Show when={open()}>
          <div class="help-tabs-panel" role="dialog" aria-label={t('helpTabs.title')}>
            <div class="help-tabs-header">
              <h3>{t('helpTabs.title')}</h3>
              <button class="help-tabs-close" onClick={toggle} aria-label={t('common.close')} type="button">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div class="help-tabs-nav" role="tablist" aria-label={t('helpTabs.tabs')}>
              {props.tabs.map((tab) => (
                <button
                  class={activeTab() === tab.id ? 'help-tabs-tab active' : 'help-tabs-tab'}
                  role="tab"
                  aria-selected={activeTab() === tab.id}
                  aria-controls={`help-panel-${tab.id}`}
                  id={`help-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div class="help-tabs-panels">
              {props.tabs.map((tab) => (
                <div
                  class={activeTab() === tab.id ? 'help-tabs-panel active' : 'help-tabs-panel'}
                  role="tabpanel"
                  id={`help-panel-${tab.id}`}
                  aria-labelledby={`help-tab-${tab.id}`}
                >
                  <div class="help-tabs-content" innerHTML={sanitizeHtml(tab.content)} />
                </div>
              ))}
            </div>

            <div class="help-tabs-footer">
              <button class="btn btn-primary" onClick={toggle}>
                {t('common.close')}
              </button>
            </div>
          </div>
        </Show>
      </div>

      <style>{`
        .help-tabs-wrapper { position: relative; }
        .help-tabs { position: relative; }
        .help-tabs-trigger {
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
        .help-tabs-trigger:hover {
          background: var(--color-surface-hover);
          border-color: var(--color-primary);
        }
        .help-tabs-trigger .chevron {
          transition: transform 0.15s;
          flex-shrink: 0;
        }
        .help-tabs-trigger[aria-expanded="true"] .chevron {
          transform: rotate(180deg);
        }
        .help-tabs-panel {
          position: absolute;
          top: calc(100% + 0.5rem);
          right: 0;
          width: 480px;
          max-width: 90vw;
          max-height: 70vh;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-xl);
          z-index: 1000;
          display: flex;
          flex-direction: column;
          animation: slideIn 0.15s ease-out;
          overflow: hidden;
        }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-0.5rem); } to { opacity: 1; transform: translateY(0); } }
        .help-tabs-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem;
          border-bottom: 1px solid var(--color-border);
        }
        .help-tabs-header h3 { font-size: 0.875rem; font-weight: 600; }
        .help-tabs-close {
          background: none; border: none; padding: 0.25rem;
          color: var(--color-muted); cursor: pointer; border-radius: var(--radius-sm);
        }
        .help-tabs-close:hover { background: var(--color-background); color: var(--color-text); }
        .help-tabs-nav {
          display: flex;
          border-bottom: 1px solid var(--color-border);
          overflow-x: auto;
        }
        .help-tabs-tab {
          padding: 0.75rem 1rem;
          background: none; border: none;
          color: var(--color-muted); font-size: 0.8125rem; font-weight: 500;
          cursor: pointer; white-space: nowrap;
          border-bottom: 2px solid transparent;
          transition: all 0.15s;
        }
        .help-tabs-tab:hover { color: var(--color-text); background: var(--color-background); }
        .help-tabs-tab.active {
          color: var(--color-primary);
          border-bottom-color: var(--color-primary);
          font-weight: 600;
        }
        .help-tabs-panels {
          flex: 1; overflow-y: auto; padding: 1.5rem;
        }
        .help-tabs-panel { display: none; }
        .help-tabs-panel.active { display: block; animation: fadeIn 0.15s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .help-tabs-content { line-height: 1.6; color: var(--color-text); }
        .help-tabs-content h4 { font-size: 0.9375rem; font-weight: 600; margin: 1rem 0 0.5rem; color: var(--color-text); }
        .help-tabs-content h4:first-child { margin-top: 0; }
        .help-tabs-content p { margin: 0 0 0.75rem; color: var(--color-muted); }
        .help-tabs-content ul { margin: 0 0 0.75rem 1.25rem; color: var(--color-text); }
        .help-tabs-content li { margin-bottom: 0.375rem; }
        .help-tabs-content code {
          background: var(--color-background); padding: 0.125rem 0.375rem;
          border-radius: var(--radius-sm); font-size: 0.8125rem;
          font-family: ui-monospace, SFMono-Regular, monospace;
        }
        .help-tabs-content a { color: var(--color-primary); text-decoration: underline; }
        .help-tabs-footer {
          display: flex; justify-content: flex-end;
          padding: 1rem; border-top: 1px solid var(--color-border);
        }
      `}</style>
    </div>
  );
}