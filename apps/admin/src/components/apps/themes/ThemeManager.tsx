import { For, createSignal, onMount, Show } from 'solid-js';
import { useTranslation } from '../../../i18n';
import { apiClient, ThemeInfo } from '../../../lib/api';

export function ThemeManager() {
  const { t } = useTranslation();
  const [themes, setThemes] = createSignal<ThemeInfo[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [toggling, setToggling] = createSignal<string | null>(null);
  const [installForm, setInstallForm] = createSignal({ name: '', version: '', manifest: '{}' });
  const [showInstall, setShowInstall] = createSignal(false);

  onMount(async () => {
    await loadThemes();
  });

  async function loadThemes() {
    try {
      setLoading(true);
      const data = await apiClient.getThemes();
      setThemes(data);
    } catch (err) {
      setError(t('themes.loadError'));
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(theme: ThemeInfo) {
    const wasActive = theme.status === 'ACTIVE';
    setToggling(theme.id);
    try {
      const updated = wasActive
        ? await apiClient.deactivateTheme(theme.id)
        : await apiClient.activateTheme(theme.id);
      setThemes(themes().map(t => t.id === theme.id ? updated : t));
    } catch (err) {
      setError(wasActive ? t('themes.deactivateError') : t('themes.activateError'));
    } finally {
      setToggling(null);
    }
  }

  async function installTheme(event: Event): Promise<void> {
    event.preventDefault();
    try {
      const form = installForm();
      await apiClient.installTheme({ name: form.name, version: form.version, manifest: JSON.parse(form.manifest) });
      setInstallForm({ name: '', version: '', manifest: '{}' });
      setShowInstall(false);
      await loadThemes();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('themes.installError'));
    }
  }

  async function uninstallTheme(theme: ThemeInfo): Promise<void> {
    if (!confirm(t('themes.confirmUninstall', { name: theme.name }))) return;
    try {
      await apiClient.uninstallTheme(theme.id);
      await loadThemes();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('themes.uninstallError'));
    }
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
      <div class="page-header">
        <h2>{t('themes.title')}</h2>
        <p class="page-description">{t('themes.description')}</p>
        <button class="btn btn-primary" type="button" onClick={() => setShowInstall(!showInstall())}>{t('themes.install')}</button>
      </div>

      <Show when={showInstall()}>
        <form class="card theme-install-form" onSubmit={installTheme}>
          <input class="input" required placeholder={t('themes.name')} value={installForm().name} onInput={(event) => setInstallForm({ ...installForm(), name: event.currentTarget.value })} />
          <input class="input" required placeholder={t('themes.version')} value={installForm().version} onInput={(event) => setInstallForm({ ...installForm(), version: event.currentTarget.value })} />
          <textarea class="input" required rows={5} placeholder={t('themes.manifest')} value={installForm().manifest} onInput={(event) => setInstallForm({ ...installForm(), manifest: event.currentTarget.value })} />
          <button class="btn btn-primary" type="submit">{t('common.save')}</button>
        </form>
      </Show>

      {error() && <div class="alert alert-error">{error()}</div>}

      {loading() && <div class="skeleton">Loading...</div>}

      {!loading() && !error() && (
        <div class="themes-grid">
          <For each={themes()}>
            {(theme) => (
              <div class={`theme-card ${theme.status === 'ACTIVE' ? 'active' : ''}`}>
                <div class="theme-preview">
                  {theme.manifest?.name && (
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
                  <button class="btn btn-danger" type="button" onClick={() => void uninstallTheme(theme)}>{t('themes.uninstall')}</button>
                </div>
              </div>
            )}
          </For>
          {themes().length === 0 && <div class="empty-state">{t('themes.empty')}</div>}
        </div>
      )}

      <style>{`
        .page-header {
          margin-bottom: 1.5rem;
        }
        .page-header h2 {
          margin: 0 0 0.5rem;
          font-size: 1.5rem;
          font-weight: 600;
        }
        .page-description {
          margin: 0;
          color: var(--color-muted);
          font-size: 0.875rem;
        }
        .theme-install-form {
          display: grid;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
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
        .skeleton {
          padding: 2rem;
          text-align: center;
          color: var(--color-muted);
        }
      `}</style>
    </div>
  );
}
