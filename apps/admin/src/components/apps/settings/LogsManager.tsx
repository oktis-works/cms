import { For, Show, createSignal, onMount } from 'solid-js';
import { apiClient, type AuditLogEntry } from '../../../lib/api';
import { useTranslation } from '../../../i18n';

export function LogsManager() {
  const { t } = useTranslation();
  const [logs, setLogs] = createSignal<AuditLogEntry[]>([]);
  const [retentionDays, setRetentionDays] = createSignal(90);
  const [action, setAction] = createSignal('');
  const [resourceType, setResourceType] = createSignal('');
  const [error, setError] = createSignal('');
  const [notice, setNotice] = createSignal('');
  const [loading, setLoading] = createSignal(true);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const [config, result] = await Promise.all([
        apiClient.getAuditLogConfig(),
        apiClient.listAuditLogs({ limit: 500, action: action() || undefined, resourceType: resourceType() || undefined }),
      ]);
      setRetentionDays(config.retentionDays);
      setLogs(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  onMount(load);

  const saveRetention = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    try {
      const result = await apiClient.updateAuditLogConfig(retentionDays());
      setRetentionDays(result.retentionDays);
      setNotice(t('logs.retentionSaved'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div class="resource-hub logs-manager">
      <Show when={error()}><div class="notice notice--error">{error()}</div></Show>
      <Show when={notice()}><div class="notice notice--success">{notice()}</div></Show>

      <section class="card">
        <div class="card-header-row"><div><h3>{t('logs.retentionTitle')}</h3><p>{t('logs.retentionDescription')}</p></div></div>
        <form class="resource-form logs-retention-form" onSubmit={saveRetention}>
          <label>{t('logs.retentionDays')}<input class="input" type="number" min="1" max="3650" required value={retentionDays()} onInput={(event) => setRetentionDays(Number(event.currentTarget.value))} /></label>
          <button class="btn btn-primary" type="submit">{t('common.save')}</button>
        </form>
      </section>

      <section class="card">
        <div class="card-header-row"><h3>{t('logs.historyTitle')}</h3><button class="btn" type="button" onClick={() => void load()}>{t('common.refresh')}</button></div>
        <div class="logs-filters">
          <input class="input" placeholder={t('logs.actionFilter')} value={action()} onInput={(event) => setAction(event.currentTarget.value)} />
          <input class="input" placeholder={t('logs.resourceFilter')} value={resourceType()} onInput={(event) => setResourceType(event.currentTarget.value)} />
          <button class="btn" type="button" onClick={() => void load()}>{t('common.filter')}</button>
        </div>
        <Show when={!loading()} fallback={<p>{t('logs.loading')}</p>}>
          <Show when={logs().length > 0} fallback={<p>{t('logs.empty')}</p>}>
            <div class="table-scroll"><table class="table"><thead><tr><th>{t('logs.columns.date')}</th><th>{t('logs.columns.action')}</th><th>{t('logs.columns.resource')}</th><th>{t('logs.columns.user')}</th><th>{t('logs.columns.status')}</th><th>{t('logs.columns.ip')}</th></tr></thead><tbody>
              <For each={logs()}>{(entry) => <tr>
                <td>{entry.created_at ? new Date(entry.created_at).toLocaleString() : '—'}</td>
                <td><code>{entry.action}</code></td>
                <td>{entry.resourceType}{entry.resourceId ? `:${entry.resourceId}` : ''}</td>
                <td>{entry.userId ?? t('logs.system')}</td>
                <td>{String(entry.changes?.['status'] ?? '—')}</td>
                <td>{entry.ipAddress ?? '—'}</td>
              </tr>}</For>
            </tbody></table></div>
          </Show>
        </Show>
      </section>
    </div>
  );
}
