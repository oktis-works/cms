import { For, createSignal, onMount, Show } from 'solid-js';
import { useTranslation } from '../../../i18n';
import { apiClient, PluginInfo } from '../../../lib/api';

export function PluginManager() {
  const { t } = useTranslation();
  const [plugins, setPlugins] = createSignal<PluginInfo[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [toggling, setToggling] = createSignal<string | null>(null);

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

  async function handleToggle(plugin: PluginInfo) {
    const wasActive = plugin.status === 'ACTIVE';
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

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ACTIVE': return t('plugins.status.active');
      case 'INSTALLED': return t('plugins.status.installed');
      case 'INACTIVE': return t('plugins.status.inactive');
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
    <div class="plugin-manager">
      <div class="page-header">
        <h2>{t('plugins.title')}</h2>
        <p class="page-description">{t('plugins.description')}</p>
      </div>

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
                        aria-label={plugin.status === 'ACTIVE' ? t('plugins.deactivate') : t('plugins.activate')}
                      >
                        {plugin.status === 'ACTIVE'
                          ? t('plugins.deactivate')
                          : t('plugins.activate')}
                      </button>
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
