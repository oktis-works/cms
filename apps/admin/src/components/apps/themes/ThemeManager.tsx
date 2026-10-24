import { For, Show, createSignal, onMount } from 'solid-js';
import { useTranslation } from '../../../i18n';
import { apiClient, ThemeInfo } from '../../../lib/api';

export function ThemeManager() {
  const { t } = useTranslation();
  const [themes, setThemes] = createSignal<ThemeInfo[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [warning, setWarning] = createSignal<string | null>(null);
  const [toggling, setToggling] = createSignal<string | null>(null);

  onMount(async () => {
    await loadThemes();
  });

  async function loadThemes() {
    setError(null);
    setWarning(null);
    try {
      setLoading(true);
      // Explicit discovery (POST /sync — a write) followed by the listing.
      // Without create permission (or if sync fails), degrade to a pure read
      // instead of leaving the screen empty.
      let data: ThemeInfo[];
      try {
        data = await apiClient.syncThemes();
      } catch {
        data = await apiClient.getThemes();
      }
      setThemes(data);
    } catch {
      setError(t('themes.loadError'));
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(theme: ThemeInfo) {
    const wasActive = theme.status === 'ACTIVE';
    setError(null);
    setWarning(null);
    // Invariant: the site must always keep an active theme. Deactivation is
    // only offered when another theme exists; otherwise warn and skip it.
    if (wasActive && themes().length <= 1) {
      setWarning(t('themes.deactivateBlocked'));
      return;
    }
    setToggling(theme.id);
    try {
      const updated = wasActive
        ? await apiClient.deactivateTheme(theme.id)
        : await apiClient.activateTheme(theme.id);
      // Activating deactivates the others server-side — reflect it on ALL cards.
      setThemes(
        themes().map((item) =>
          item.id === theme.id
            ? updated
            : item.status === 'ACTIVE' && updated.status === 'ACTIVE'
              ? { ...item, status: 'INACTIVE' }
              : item
        )
      );
    } catch {
      setError(wasActive ? t('themes.deactivateError') : t('themes.activateError'));
    } finally {
      setToggling(null);
    }
  }

  /** Manifest preview: absolute URL, absolute path or theme file. */
  function previewUrl(theme: ThemeInfo): string | null {
    const raw = theme.manifest?.preview ?? theme.manifest?.screenshots?.[0];
    if (!raw || typeof raw !== 'string') return null;
    if (/^(https?:)?\/\//.test(raw) || raw.startsWith('/')) return raw;
    return `/themes/${encodeURIComponent(theme.name)}/${raw}`;
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ACTIVE': return t('themes.status.active');
      case 'INSTALLED': return t('themes.status.installed');
      case 'INACTIVE': return t('themes.status.inactive');
      default: return status;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'status-active';
      case 'INSTALLED': return 'status-installed';
      case 'INACTIVE': return 'status-inactive';
      default: return '';
    }
  };

  return (
    <div class="theme-manager">
      <div class="theme-toolbar">
        <p class="page-hint">{t('themes.directoryHint')}</p>
        <button class="btn btn-refresh" onClick={loadThemes} disabled={loading()}>
          {t('themes.reload')}
        </button>
      </div>

      {error() && <div class="alert alert-error">{error()}</div>}
      {warning() && <div class="alert alert-warning">{warning()}</div>}

      {loading() && <div class="skeleton">Loading...</div>}

      {!loading() && (
        <div class="themes-grid">
          <For each={themes()}>
            {(theme) => {
              const preview = previewUrl(theme);
              return (
                <div class={`theme-card ${theme.status === 'ACTIVE' ? 'active' : ''}`}>
                  <div class="theme-preview">
                    <Show when={preview}>
                      <img
                        class="theme-preview__img"
                        src={preview!}
                        alt=""
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                    </Show>
                    {theme.status === 'ACTIVE' && (
                      <div class="theme-badge active-badge">{t('themes.active')}</div>
                    )}
                  </div>
                  <div class="theme-info">
                    <h3>{theme.name}</h3>
                    <p class="theme-version">{t('themes.version')}: {theme.version}</p>
                    <p class="theme-status">
                      <span class={`status-badge ${getStatusClass(theme.status)}`}>
                        {getStatusLabel(theme.status)}
                      </span>
                    </p>
                    {theme.manifest?.description && (
                      <p class="theme-desc">{theme.manifest!.description}</p>
                    )}
                  </div>

                  <div class="theme-actions">
                    <button
                      class={`btn ${toggling() === theme.id ? 'btn-loading' : ''}`}
                      onClick={() => handleToggle(theme)}
                      disabled={toggling() !== null}
                    >
                      {theme.status === 'ACTIVE'
                        ? t('themes.deactivate')
                        : t('themes.activate')}
                    </button>
                    <a
                      class="btn btn-secondary"
                      href={`/customize${theme.status === 'ACTIVE' ? '' : `?theme=${encodeURIComponent(theme.id)}`}`}
                    >
                      {t('themes.customize')}
                    </a>
                  </div>
                </div>
              );
            }}
          </For>
          {themes().length === 0 && <div class="empty-state">{t('themes.empty')}</div>}
        </div>
      )}

      <style>{`
        .theme-toolbar {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1.25rem;
        }
        .page-hint {
          margin: 0;
          color: var(--color-muted);
          font-size: 0.8125rem;
        }
        .btn-refresh {
          flex-shrink: 0;
        }
        .themes-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1.5rem;
        }
        .theme-card {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          transition: all 0.2s;
        }
        .theme-card:hover {
          border-color: var(--color-primary);
          box-shadow: var(--shadow-md);
        }
        .theme-card.active {
          border-color: var(--color-primary);
          box-shadow: 0 0 0 1px var(--color-primary), var(--shadow-md);
        }
        .theme-preview {
          position: relative;
        }
        .theme-preview__img {
          display: block;
          width: 100%;
          border-radius: var(--radius-md);
          border: 1px solid var(--color-border);
        }
        .theme-badge {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          background: var(--color-primary);
          color: var(--color-primary-contrast);
          padding: 0.25rem 0.5rem;
          border-radius: var(--radius-full);
          font-size: 0.625rem;
          font-weight: 700;
          text-transform: uppercase;
        }
        .theme-info {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .theme-info h3 {
          margin: 0;
          font-size: 1.125rem;
          font-weight: 600;
        }
        .theme-version {
          margin: 0;
          font-size: 0.75rem;
          color: var(--color-muted);
        }
        .theme-desc {
          margin: 0;
          font-size: 0.8125rem;
          color: var(--color-text);
          line-height: 1.5;
        }
        .theme-status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .status-badge {
          display: inline-flex;
          align-items: center;
          padding: 0.25rem 0.5rem;
          border-radius: var(--radius-full);
          font-size: 0.625rem;
          font-weight: 600;
          text-transform: uppercase;
        }
        .status-active {
          background: var(--color-success-soft);
          color: var(--color-success);
        }
        .status-installed {
          background: var(--color-primary-soft);
          color: var(--color-primary);
        }
        .status-inactive {
          background: var(--color-muted-soft);
          color: var(--color-muted);
        }
        .theme-actions {
          margin-top: 0.5rem;
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .btn-loading {
          opacity: 0.6;
          cursor: wait;
        }
        .empty-state {
          grid-column: 1 / -1;
          padding: 3rem;
          text-align: center;
          color: var(--color-muted);
        }
        .alert {
          padding: 0.75rem 1rem;
          border-radius: var(--radius-md);
          margin-bottom: 1rem;
        }
        .alert-error {
          background: var(--color-error-soft);
          color: var(--color-error);
          border: 1px solid var(--color-error);
        }
        .alert-warning {
          background: var(--color-warning-soft);
          color: var(--color-warning);
          border: 1px solid var(--color-warning);
        }
        .skeleton {
          padding: 2rem;
          text-align: center;
          color: var(--color-muted);
        }
      `}</style>
    </div>
  );
}
