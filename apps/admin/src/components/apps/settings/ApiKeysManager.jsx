import { For, Show, createSignal, onMount } from 'solid-js';
import { apiClient } from '../../../lib/api';
import { useTranslation } from '../../../i18n';
import { Modal } from '../../ui/Modal';
const emptyForm = (defaultUserId) => ({
    name: '',
    userId: defaultUserId,
    oneTime: false,
    expiresAt: '',
});
function formatDate(value) {
    if (!value)
        return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
export function ApiKeysManager() {
    const { t } = useTranslation();
    const [keys, setKeys] = createSignal([]);
    const [users, setUsers] = createSignal([]);
    const [form, setForm] = createSignal(null);
    const [created, setCreated] = createSignal(null);
    const [error, setError] = createSignal('');
    const [notice, setNotice] = createSignal('');
    const [loading, setLoading] = createSignal(true);
    const [copied, setCopied] = createSignal(false);
    const load = async () => {
        setLoading(true);
        try {
            const list = await apiClient.getApiKeys();
            setKeys(list);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setLoading(false);
        }
    };
    onMount(() => {
        void load();
        // Usários do tenant para o select de identidade da key (best-effort:
        // a API também aceita omitir userId e usa o criador).
        void apiClient
            .listUsers({ limit: 100, status: 'ACTIVE' })
            .then((res) => setUsers(res.data ?? []))
            .catch(() => setUsers([]));
    });
    const openForm = () => {
        setError('');
        setNotice('');
        setForm(emptyForm(users()[0]?.id ?? ''));
    };
    const submit = async (event) => {
        event.preventDefault();
        const current = form();
        if (!current)
            return;
        if (!current.name.trim()) {
            setError(t('apiKeys.errors.nameRequired'));
            return;
        }
        try {
            const payload = {
                name: current.name.trim(),
                oneTime: current.oneTime,
            };
            if (current.userId)
                payload.userId = current.userId;
            if (current.expiresAt)
                payload.expiresAt = new Date(current.expiresAt).toISOString();
            const key = await apiClient.createApiKey(payload);
            setForm(null);
            setCreated(key);
            setCopied(false);
            await load();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    };
    const revoke = async (key) => {
        if (!key.id)
            return;
        setError('');
        try {
            await apiClient.deleteApiKey(key.id);
            setNotice(t('apiKeys.revoked'));
            await load();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    };
    const copyPlaintext = async () => {
        const value = created()?.plaintext;
        if (!value)
            return;
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
        }
        catch {
            // Clipboard indisponível (sem HTTPS/permissão): o valor segue visível
            // no campo para cópia manual.
            setCopied(false);
        }
    };
    const closeCreated = () => {
        setCreated(null);
        setCopied(false);
    };
    const ownerName = (key) => {
        const user = users().find((entry) => entry.id === key.user_id);
        return user ? user.name : (key.user_id ?? '—');
    };
    return (<div class="resource-hub api-keys-manager">
      <Show when={error()}><div class="notice notice--error">{error()}</div></Show>
      <Show when={notice()}><div class="notice notice--success">{notice()}</div></Show>

      <div class="card-header-row">
        <div>
          <h3>{t('apiKeys.listTitle')}</h3>
          <p class="muted">{t('apiKeys.howItWorks')}</p>
        </div>
        <button class="btn btn-primary" type="button" onClick={openForm}>{t('apiKeys.new')}</button>
      </div>

      <Show when={form()}>
        <section class="card">
          <h3>{t('apiKeys.create')}</h3>
          <form class="resource-form" onSubmit={submit}>
            <label>{t('apiKeys.form.name')}
              <input class="input" required type="text" value={form()?.name ?? ''} placeholder={t('apiKeys.form.namePlaceholder')} onInput={(event) => form() && setForm({ ...form(), name: event.currentTarget.value })}/>
            </label>
            <label>{t('apiKeys.form.user')}
              <select class="input" value={form()?.userId ?? ''} onChange={(event) => form() && setForm({ ...form(), userId: event.currentTarget.value })}>
                <Show when={users().length > 0} fallback={<option value="">{t('apiKeys.form.currentUser')}</option>}>
                  <For each={users()}>{(user) => <option value={user.id}>{user.name} ({user.email})</option>}</For>
                </Show>
              </select>
            </label>
            <label>{t('apiKeys.form.expiresAt')}
              <input class="input" type="datetime-local" value={form()?.expiresAt ?? ''} onInput={(event) => form() && setForm({ ...form(), expiresAt: event.currentTarget.value })}/>
            </label>
            <label class="checkbox-label">
              <input type="checkbox" checked={form()?.oneTime ?? false} onChange={(event) => form() && setForm({ ...form(), oneTime: event.currentTarget.checked })}/> {t('apiKeys.form.oneTime')}
            </label>
            <p class="muted">{t('apiKeys.form.oneTimeHint')}</p>
            <div>
              <button class="btn btn-primary" type="submit">{t('apiKeys.createSubmit')}</button>{' '}
              <button class="btn" type="button" onClick={() => setForm(null)}>{t('common.cancel')}</button>
            </div>
          </form>
        </section>
      </Show>

      <section class="card">
        <Show when={!loading()} fallback={<p>{t('apiKeys.loading')}</p>}>
          <Show when={keys().length > 0} fallback={<p>{t('apiKeys.empty')}</p>}>
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr>
                    <th>{t('apiKeys.form.name')}</th>
                    <th>{t('apiKeys.form.user')}</th>
                    <th>{t('apiKeys.prefix')}</th>
                    <th>{t('apiKeys.lastUsed')}</th>
                    <th>{t('apiKeys.status')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={keys()}>
                    {(key) => (<tr>
                        <td>{key.name}</td>
                        <td>{ownerName(key)}</td>
                        <td><code>okcms_{key.key_prefix}_…</code></td>
                        <td>{key.last_used_at ? formatDate(key.last_used_at) : t('apiKeys.neverUsed')}</td>
                        <td>
                          <Show when={!key.revoked_at} fallback={<span class="notice notice--error">{t('apiKeys.status.revoked')}</span>}>
                            <Show when={key.expires_at && new Date(key.expires_at).getTime() <= Date.now()} fallback={<span>{key.one_time ? t('apiKeys.status.oneTime') : t('apiKeys.status.active')}</span>}>
                              <span>{t('apiKeys.status.expired')}</span>
                            </Show>
                          </Show>
                        </td>
                        <td>
                          <Show when={!key.revoked_at}>
                            <button class="btn btn-danger" type="button" onClick={() => void revoke(key)}>
                              {t('apiKeys.revoke')}
                            </button>
                          </Show>
                        </td>
                      </tr>)}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Show>
      </section>

      <Modal open={!!created()} onClose={closeCreated} title={t('apiKeys.created.title')}>
        <div class="modal-body">
          <div class="notice notice--error">{t('apiKeys.created.warning')}</div>
          <label>{t('apiKeys.created.value')}
            <input class="input" readonly type="text" value={created()?.plaintext ?? ''} onFocus={(event) => event.currentTarget.select()} data-testid="api-key-plaintext"/>
          </label>
          <p class="muted">{t('apiKeys.created.howToUse')}</p>
          <pre class="api-key-sample"><code>{`POST /api/v1/auth/api-key-login\n{ "apiKey": "${created()?.plaintext ?? ''}" }`}</code></pre>
          <div>
            <button class="btn btn-primary" type="button" onClick={() => void copyPlaintext()}>
              {copied() ? t('apiKeys.created.copied') : t('apiKeys.created.copy')}
            </button>{' '}
            <button class="btn" type="button" onClick={closeCreated}>{t('common.close')}</button>
          </div>
        </div>
      </Modal>

      <style>{`.api-key-sample{background:var(--color-surface-muted,#f5f5f5);border:1px solid var(--color-border,#dcdcde);border-radius:4px;padding:.6rem;overflow:auto;font-size:.8rem;white-space:pre-wrap;word-break:break-all}.api-keys-manager .modal-body{display:grid;gap:.75rem;padding:1rem}`}</style>
    </div>);
}
//# sourceMappingURL=ApiKeysManager.jsx.map