import { For, createSignal, onMount, Show } from 'solid-js';
import { useTranslation } from '../../../i18n';
import { apiClient, PluginInfo } from '../../../lib/api';

export function PluginManager() {
  const { t } = useTranslation();
  const [plugins, setPlugins] = createSignal<PluginInfo[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [toggling, setToggling] = createSignal<string | null>(null);
  const [installForm, setInstallForm] = createSignal({ name: '', version: '', manifest: '{}' });
  const [showInstall, setShowInstall] = createSignal(false);

  onMount(async () => {
    await loadPlugins();
  });

  async function loadPlugins() {
    try {
      setLoading(true);
      const data = await apiClient.getPlugins();
      setPlugins(data);
    } catch (err) {
      setError(t('plugins.loadError'));
    } finally {
      setLoading(false);
    }
  }

  const isActive = (plugin: PluginInfo): boolean => plugin.status === 'ACTIVE' || plugin.status === 'ACTIVATED';

  async function handleToggle(plugin: PluginInfo) {
    const wasActive = isActive(plugin);
    setToggling(plugin.id);
    try {
      const updated = wasActive
        ? await apiClient.deactivatePlugin(plugin.id)
        : await apiClient.activatePlugin(plugin.id);
      setPlugins(plugins().map(p => p.id === plugin.id ? updated : p));
    } catch (err) {
      setError(wasActive ? t('plugins.deactivateError') : t('plugins.activateError'));
    } finally {
      setToggling(null);
    }
  }

  async function installPlugin(event: Event): Promise<void> {
    event.preventDefault();
    try {
      const form = installForm();
      await apiClient.installPlugin({ name: form.name, version: form.version, manifest: JSON.parse(form.manifest) });
      setInstallForm({ name: '', version: '', manifest: '{}' });
      setShowInstall(false);
      await loadPlugins();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('plugins.installError'));
    }
  }

  async function uninstallPlugin(plugin: PluginInfo): Promise<void> {
    if (!confirm(t('plugins.confirmUninstall', { name: plugin.name }))) return;
    try {
      await apiClient.uninstallPlugin(plugin.id);
      await loadPlugins();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('plugins.uninstallError'));
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ACTIVE':
      case 'ACTIVATED': return t('plugins.status.active');
      case 'INSTALLED': return t('plugins.status.installed');
      case 'INACTIVE':
      case 'DEACTIVATED': return t('plugins.status.inactive');
      default: return status;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'ACTIVE':
      case 'ACTIVATED': return 'status-active';
      case 'INSTALLED': return 'status-installed';
      case 'INACTIVE':
      case 'DEACTIVATED': return 'status-inactive';
      default: return '';
    }
  };

  return (
    <div class="plugin-manager">
      <div class="page-header">
        <h2>{t('plugins.title')}</h2>
        <p class="page-description">{t('plugins.description')}</p>
        <button class="btn btn-primary" type="button" onClick={() => setShowInstall(!showInstall())}>{t('plugins.install')}</button>
      </div>

      <Show when={showInstall()}>
        <form class="card plugin-install-form" onSubmit={installPlugin}>
          <input class="input" required placeholder={t('plugins.name')} value={installForm().name} onInput={(event) => setInstallForm({ ...installForm(), name: event.currentTarget.value })} />
          <input class="input" required placeholder={t('plugins.version')} value={installForm().version} onInput={(event) => setInstallForm({ ...installForm(), version: event.currentTarget.value })} />
          <textarea class="input" required rows={5} placeholder={t('plugins.manifest')} value={installForm().manifest} onInput={(event) => setInstallForm({ ...installForm(), manifest: event.currentTarget.value })} />
          <button class="btn btn-primary" type="submit">{t('common.save')}</button>
        </form>
      </Show>

      {error() && <div class="alert alert-error">{error()}</div>}

      {loading() && <div class="skeleton">Loading...</div>}

      {!loading() && !error() && (
        <div class="plugins-table-container">
          <table class="table">
            <thead>
              <tr>
                <th>{t('plugins.columns.name')}</th>
                <th>{t('plugins.columns.version')}</th>
                <th>{t('plugins.columns.status')}</th>
                <th>{t('plugins.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              <For each={plugins()}>
                {(plugin) => (
                  <tr class="plugin-row">
                    <td class="plugin-name">
                      <strong>{plugin.name}</strong>
                      {plugin.manifest?.description && (
                        <span class="plugin-description">{plugin.manifest!.description}</span>
                      )}
                    </td>
                    <td>{plugin.version}</td>
                    <td>
                      <span class={`status-badge ${getStatusClass(plugin.status)}`}>
                        {getStatusLabel(plugin.status)}
                      </span>
                    </td>
                    <td>
                      <button
                        class={`btn btn-sm ${toggling() === plugin.id ? 'btn-loading' : ''}`}
                        onClick={() => handleToggle(plugin)}
                        disabled={toggling() !== null}
                        aria-label={isActive(plugin) ? t('plugins.deactivate') : t('plugins.activate')}
                      >
                        {isActive(plugin)
                          ? t('plugins.deactivate')
                          : t('plugins.activate')}
                      </button>
                      <button class="btn btn-sm btn-danger" type="button" onClick={() => void uninstallPlugin(plugin)}>{t('plugins.uninstall')}</button>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
          {plugins().length === 0 && <div class="empty-state">{t('plugins.empty')}</div>}
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
        .plugins-table-container {
          overflow-x: auto;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
        }
        .table th,
        .table td {
          padding: 0.75rem 1rem;
          text-align: left;
          border-bottom: 1px solid var(--color-border);
        }
        .table th {
          font-weight: 600;
          color: var(--color-text);
          background: var(--color-surface);
        }
        .plugin-row:hover {
          background: var(--color-background);
        }
        .plugin-name {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .plugin-name strong {
          font-weight: 500;
        }
        .plugin-description {
          font-size: 0.75rem;
          color: var(--color-muted);
        }
        .status-badge {
          display: inline-flex;
          align-items: center;
          padding: 0.25rem 0.5rem;
          border-radius: var(--radius-full);
          font-size: 0.6875rem;
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
        .btn-loading {
          opacity: 0.6;
          cursor: wait;
        }
        .empty-state {
          padding: 2rem;
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
