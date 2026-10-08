import { For, Show, createSignal, onMount } from 'solid-js';
import { apiClient, type Webhook, type WebhookEventOption } from '../../../lib/api';
import { useTranslation } from '../../../i18n';

type AuthType = NonNullable<Webhook['auth_type']>;
type AuthConfig = NonNullable<Webhook['auth_config']>;
type WebhookForm = Partial<Webhook> & { auth_type: AuthType; auth_config: AuthConfig };

const emptyForm = (): WebhookForm => ({
  url: '',
  events: [],
  active: true,
  auth_type: 'hmac_sha256',
  auth_config: { signatureHeader: 'X-Webhook-Signature' },
});

export function WebhooksManager() {
  const { t } = useTranslation();
  const [webhooks, setWebhooks] = createSignal<Webhook[]>([]);
  const [eventOptions, setEventOptions] = createSignal<WebhookEventOption[]>([]);
  const [form, setForm] = createSignal<WebhookForm | null>(null);
  const [error, setError] = createSignal('');
  const [loading, setLoading] = createSignal(true);

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const [hooks, events] = await Promise.all([apiClient.getWebhooks(), apiClient.getWebhookEvents()]);
      setWebhooks(hooks);
      setEventOptions(events);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  onMount(load);

  const edit = (hook?: Webhook): void => {
    if (!hook) {
      setForm(emptyForm());
      return;
    }
    setForm({
      ...hook,
      events: [...(hook.events ?? [])],
      auth_type: hook.auth_type ?? 'hmac_sha256',
      auth_config: { ...(hook.auth_config ?? {}) },
    });
  };

  const updateConfig = (key: keyof AuthConfig, value: string): void => {
    const current = form();
    if (!current) return;
    setForm({ ...current, auth_config: { ...current.auth_config, [key]: value } });
  };

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    const current = form();
    if (!current) return;
    const authConfig = Object.fromEntries(Object.entries(current.auth_config).filter(([, value]) => value));
    try {
      if (current.id) await apiClient.updateWebhook(current.id, { ...current, auth_config: authConfig });
      else await apiClient.createWebhook({ ...current, auth_config: authConfig });
      setForm(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div class="resource-hub webhooks-manager">
      <Show when={error()}><div class="notice notice--error">{error()}</div></Show>
      <div class="card-header-row"><div><h3>{t('webhooks.listTitle')}</h3><p>{t('webhooks.description')}</p></div><button class="btn btn-primary" type="button" onClick={() => edit()}>{t('webhooks.new')}</button></div>

      <Show when={form()}>{(current) => <section class="card">
        <h3>{current().id ? t('webhooks.edit') : t('webhooks.create')}</h3>
        <form class="resource-form" onSubmit={submit}>
          <label>{t('webhooks.url')}<input class="input" required type="url" value={current().url ?? ''} onInput={(event) => setForm({ ...current(), url: event.currentTarget.value })} /></label>
          <label>{t('webhooks.events')}<select class="input" multiple required value={current().events ?? []} onChange={(event) => setForm({ ...current(), events: Array.from(event.currentTarget.selectedOptions, (option) => option.value) })}>{eventOptions().map((option) => <option value={option.value}>{option.label}</option>)}</select></label>
          <label>{t('webhooks.authentication')}<select class="input" value={current().auth_type} onChange={(event) => setForm({ ...current(), auth_type: event.currentTarget.value as AuthType, auth_config: {} })}>
            <option value="none">{t('webhooks.auth.none')}</option><option value="bearer">{t('webhooks.auth.bearer')}</option><option value="basic">{t('webhooks.auth.basic')}</option><option value="api_key">{t('webhooks.auth.apiKey')}</option><option value="hmac_sha256">{t('webhooks.auth.hmac')}</option>
          </select></label>
          <Show when={current().auth_type === 'bearer'}><label>{t('webhooks.token')}<input class="input" type="password" placeholder={current().id ? t('webhooks.keepExisting') : ''} value={current().auth_config.token ?? ''} onInput={(event) => updateConfig('token', event.currentTarget.value)} /></label></Show>
          <Show when={current().auth_type === 'basic'}><div class="form-grid"><label>{t('webhooks.username')}<input class="input" value={current().auth_config.username ?? ''} onInput={(event) => updateConfig('username', event.currentTarget.value)} /></label><label>{t('webhooks.password')}<input class="input" type="password" placeholder={current().id ? t('webhooks.keepExisting') : ''} value={current().auth_config.password ?? ''} onInput={(event) => updateConfig('password', event.currentTarget.value)} /></label></div></Show>
          <Show when={current().auth_type === 'api_key'}><div class="form-grid"><label>{t('webhooks.headerName')}<input class="input" value={current().auth_config.headerName ?? ''} onInput={(event) => updateConfig('headerName', event.currentTarget.value)} /></label><label>{t('webhooks.apiKeyValue')}<input class="input" type="password" placeholder={current().id ? t('webhooks.keepExisting') : ''} value={current().auth_config.value ?? ''} onInput={(event) => updateConfig('value', event.currentTarget.value)} /></label></div></Show>
          <Show when={current().auth_type === 'hmac_sha256'}><div class="form-grid"><label>{t('webhooks.secret')}<input class="input" type="password" required={!current().id} placeholder={current().id ? t('webhooks.keepExisting') : ''} value={current().auth_config.secret ?? ''} onInput={(event) => updateConfig('secret', event.currentTarget.value)} /></label><label>{t('webhooks.signatureHeader')}<input class="input" value={current().auth_config.signatureHeader ?? 'X-Webhook-Signature'} onInput={(event) => updateConfig('signatureHeader', event.currentTarget.value)} /></label></div></Show>
          <label class="checkbox-label"><input type="checkbox" checked={current().active ?? true} onChange={(event) => setForm({ ...current(), active: event.currentTarget.checked })} /> {t('webhooks.active')}</label>
          <div><button class="btn btn-primary" type="submit">{t('common.save')}</button>{' '}<button class="btn" type="button" onClick={() => setForm(null)}>{t('common.cancel')}</button></div>
        </form>
      </section>}</Show>

      <section class="card">
        <Show when={!loading()} fallback={<p>{t('webhooks.loading')}</p>}>
          <Show when={webhooks().length > 0} fallback={<p>{t('webhooks.empty')}</p>}>
            <div class="table-scroll"><table class="table"><thead><tr><th>{t('webhooks.url')}</th><th>{t('webhooks.events')}</th><th>{t('webhooks.authentication')}</th><th>{t('webhooks.active')}</th><th>{t('common.actions')}</th></tr></thead><tbody><For each={webhooks()}>{(hook) => <tr><td>{hook.url}</td><td>{(hook.events ?? []).join(', ')}</td><td>{t(`webhooks.auth.${hook.auth_type ?? 'hmac_sha256'}`)}</td><td>{hook.active ? t('common.yes') : t('common.no')}</td><td><button class="btn" type="button" onClick={() => edit(hook)}>{t('common.edit')}</button>{' '}<button class="btn btn-danger" type="button" onClick={() => hook.id && void apiClient.deleteWebhook(hook.id).then(load)}>{t('common.delete')}</button></td></tr>}</For></tbody></table></div>
          </Show>
        </Show>
      </section>
    </div>
  );
}
