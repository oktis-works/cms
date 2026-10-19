import { For, createSignal, onMount } from 'solid-js';
import { useTranslation } from '../../../i18n';
import { apiClient } from '../../../lib/api';
export function PluginManager() {
    const { t } = useTranslation();
    const [plugins, setPlugins] = createSignal([]);
    const [loading, setLoading] = createSignal(true);
    const [error, setError] = createSignal(null);
    const [toggling, setToggling] = createSignal(null);
    const [tenantId, setTenantId] = createSignal(null);
    const [tenants, setTenants] = createSignal([]);
    const [showTenantSelector, setShowTenantSelector] = createSignal(false);
    onMount(async () => {
        await loadPlugins();
    });
    async function loadPlugins() {
        try {
            setLoading(true);
            const data = await apiClient.getPlugins();
            setPlugins(data);
        }
        catch {
            setError(t('plugins.loadError'));
        }
        finally {
            setLoading(false);
        }
    }
    async function loadTenants() {
        try {
            const data = await apiClient.listTenants({ limit: 100 });
            setTenants(data.data.map(t => ({ id: t.id ?? '', name: t.name })));
        }
        catch {
            // ignora
        }
    }
    // Ativo = enabled (vínculo ativo para o tenant corrente) OU status ACTIVATED (compat legacy)
    const isActive = (plugin) => plugin.enabled === true;
    async function handleToggle(plugin) {
        if (!tenantId()) {
            // SUPER_ADMIN precisa selecionar tenant antes
            setShowTenantSelector(true);
            await loadTenants();
            return;
        }
        const wasActive = isActive(plugin);
        setToggling(plugin.id);
        try {
            const updated = wasActive
                ? await apiClient.deactivatePlugin(plugin.id, tenantId())
                : await apiClient.activatePlugin(plugin.id, tenantId());
            setPlugins(plugins().map(p => p.id === plugin.id ? updated : p));
        }
        catch {
            setError(wasActive ? t('plugins.deactivateError') : t('plugins.activateError'));
        }
        finally {
            setToggling(null);
        }
    }
    const getStatusLabel = (status) => {
        switch (status) {
            case 'ACTIVE':
            case 'ACTIVATED': return t('plugins.status.active');
            case 'INSTALLED': return t('plugins.status.installed');
            case 'INACTIVE':
            case 'DEACTIVATED': return t('plugins.status.inactive');
            case 'QUARANTINED': return t('plugins.status.quarantined');
            case 'MISSING': return t('plugins.status.missing');
            case 'LOAD_FAILED': return t('plugins.status.loadFailed');
            default: return status;
        }
    };
    const getStatusClass = (status) => {
        switch (status) {
            case 'ACTIVE':
            case 'ACTIVATED': return 'status-active';
            case 'INSTALLED': return 'status-installed';
            case 'INACTIVE':
            case 'DEACTIVATED': return 'status-inactive';
            case 'QUARANTINED': return 'status-quarantined';
            case 'MISSING': return 'status-missing';
            case 'LOAD_FAILED': return 'status-load-failed';
            default: return '';
        }
    };
    return (<div class="plugin-manager">
      <p class="page-hint">{t('plugins.directoryHint')}</p>

      {error() && <div class="alert alert-error">{error()}</div>}

      {loading() && <div class="skeleton">Loading...</div>}

      {!loading() && !error() && (<>
          {showTenantSelector() && (<div class="tenant-selector-bar">
              <label>{t('plugins.selectTenant')}: </label>
              <select value={tenantId() ?? ''} onChange={(e) => setTenantId(e.currentTarget.value || null)}>
                <option value="">{t('plugins.selectTenantPlaceholder')}</option>
                <For each={tenants()}>
                  {(t) => <option value={t.id}>{t.name} ({t.id})</option>}
                </For>
              </select>
              <button class="btn btn-sm" onClick={() => setShowTenantSelector(false)}>
                {t('plugins.hideSelector')}
              </button>
            </div>)}

          <div class="plugins-table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>{t('plugins.columns.name')}</th>
                  <th>{t('plugins.columns.version')}</th>
                  <th>{t('plugins.columns.status')}</th>
                  <th>{t('plugins.columns.enabled')}</th>
                  <th>{t('plugins.columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                <For each={plugins()}>
                  {(plugin) => (<tr class="plugin-row">
                      <td class="plugin-name">
                        <strong>{plugin.name}</strong>
                        {plugin.manifest?.description && (<span class="plugin-description">{plugin.manifest.description}</span>)}
                        {plugin.enabled && <span class="badge-enabled">{t('plugins.enabledForTenant')}</span>}
                      </td>
                      <td>{plugin.version}</td>
                      <td>
                        <span class={`status-badge ${getStatusClass(plugin.status)}`}>
                          {getStatusLabel(plugin.status)}
                        </span>
                      </td>
                      <td>
                        {plugin.enabled ? (<span class="enabled-badge">{t('plugins.enabledYes')}</span>) : (<span class="disabled-badge">{t('plugins.enabledNo')}</span>)}
                      </td>
                      <td>
                        <button class={`btn btn-sm ${toggling() === plugin.id ? 'btn-loading' : ''}`} onClick={() => handleToggle(plugin)} disabled={toggling() !== null || !tenantId()} aria-label={isActive(plugin) ? t('plugins.deactivate') : t('plugins.activate')}>
                          {isActive(plugin)
                    ? t('plugins.deactivate')
                    : t('plugins.activate')}
                        </button>
                      </td>
                    </tr>)}
                </For>
              </tbody>
            </table>
            {plugins().length === 0 && <div class="empty-state">{t('plugins.empty')}</div>}
          </div>
        </>)}

      <style>{`
        .page-hint {
          margin: 0 0 1.25rem;
          color: var(--color-muted);
          font-size: 0.8125rem;
        }
        .tenant-selector-bar {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1rem;
          padding: 0.75rem 1rem;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          font-size: 0.8125rem;
        }
        .tenant-selector-bar select {
          flex: 1;
          max-width: 300px;
          padding: 0.375rem 0.75rem;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-background);
          color: var(--color-text);
        }
        .badge-enabled {
          display: inline-block;
          margin-left: 0.5rem;
          padding: 0.125rem 0.375rem;
          font-size: 0.625rem;
          font-weight: 600;
          text-transform: uppercase;
          background: var(--color-success-soft);
          color: var(--color-success);
          border-radius: var(--radius-full);
        }
        .enabled-badge {
          color: var(--color-success);
          font-weight: 500;
        }
        .disabled-badge {
          color: var(--color-muted);
          font-weight: 500;
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
        .status-quarantined {
          background: var(--color-warning-soft);
          color: var(--color-warning);
        }
        .status-missing {
          background: var(--color-error-soft);
          color: var(--color-error);
        }
        .status-load-failed {
          background: var(--color-error-soft);
          color: var(--color-error);
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
    </div>);
}
//# sourceMappingURL=PluginManager.jsx.map