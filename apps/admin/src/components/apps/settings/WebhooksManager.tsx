import { For, Show, createSignal, onCleanup, onMount } from 'solid-js';
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

function EventMultiSelect(props: {
  options: WebhookEventOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  searchPlaceholder: string;
  empty: string;
}) {
  const [open, setOpen] = createSignal(false);
  const [search, setSearch] = createSignal('');
  let root: HTMLDivElement | undefined;
  onMount(() => {
    const close = (event: MouseEvent): void => { if (root && !root.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    onCleanup(() => document.removeEventListener('mousedown', close));
  });
  const filtered = (): WebhookEventOption[] => props.options.filter((option) => `${option.label} ${option.value}`.toLowerCase().includes(search().toLowerCase()));
  const toggle = (value: string): void => props.onChange(props.value.includes(value) ? props.value.filter((entry) => entry !== value) : [...props.value, value]);
  return <div class="webhook-event-select" ref={root}><button type="button" class="input webhook-event-select__trigger" aria-haspopup="listbox" aria-expanded={open()} onClick={() => setOpen(!open())}><span>{props.value.length > 0 ? `${props.value.length} selecionado(s)` : props.placeholder}</span><span aria-hidden="true">⌄</span></button><Show when={open()}><div class="webhook-event-select__dropdown" role="listbox"><input class="input" placeholder={props.searchPlaceholder} value={search()} onInput={(event) => setSearch(event.currentTarget.value)} /><div class="webhook-event-select__options"><Show when={filtered().length > 0} fallback={<span class="muted">{props.empty}</span>}><For each={filtered()}>{(option) => <label class="webhook-event-option"><input type="checkbox" checked={props.value.includes(option.value)} onChange={() => toggle(option.value)} /><span>{option.label}<small>{option.value}</small></span></label>}</For></Show></div></div></Show><div class="webhook-event-select__chips"><For each={props.value}>{(value) => <button type="button" class="webhook-event-chip" onClick={() => toggle(value)}>{props.options.find((option) => option.value === value)?.label ?? value} ×</button>}</For></div></div>;
}

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
    if (!current.events || current.events.length === 0) {
      setError(t('webhooks.eventsRequired'));
      return;
    }
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
          <label>{t('webhooks.events')}<EventMultiSelect options={eventOptions()} value={current().events ?? []} onChange={(events) => setForm({ ...current(), events })} placeholder={t('webhooks.selectEvents')} searchPlaceholder={t('webhooks.searchEvents')} empty={t('webhooks.noEvents')} /></label>
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
      <style>{`.webhook-event-select{position:relative}.webhook-event-select__trigger{width:100%;display:flex;justify-content:space-between;align-items:center;text-align:left;cursor:pointer}.webhook-event-select__dropdown{position:absolute;z-index:20;top:calc(100% + .25rem);left:0;right:0;background:var(--color-surface,#fff);border:1px solid var(--color-border,#dcdcde);box-shadow:0 8px 22px rgba(0,0,0,.14);padding:.6rem}.webhook-event-select__options{max-height:240px;overflow:auto;margin-top:.5rem;display:grid;gap:.2rem}.webhook-event-option{display:flex!important;align-items:flex-start;gap:.5rem!important;padding:.45rem;border-radius:4px;cursor:pointer}.webhook-event-option:hover{background:var(--color-surface-muted,#f5f5f5)}.webhook-event-option span{display:grid;gap:.12rem}.webhook-event-option small{color:var(--color-muted);font-size:.75rem}.webhook-event-select__chips{display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.4rem}.webhook-event-chip{border:1px solid var(--color-border,#dcdcde);background:var(--color-surface-muted,#f5f5f5);border-radius:999px;padding:.2rem .55rem;cursor:pointer;font-size:.78rem}`}</style>
    </div>
  );
}
