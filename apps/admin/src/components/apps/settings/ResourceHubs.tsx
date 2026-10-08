import { For, Show, createSignal, onMount } from 'solid-js';
import { apiClient, type Role, type Tenant } from '../../../lib/api';
import { useTranslation } from '../../../i18n';

export function AccessManager() {
  const { t } = useTranslation();
  const [roles, setRoles] = createSignal<Role[]>([]);
  const [tenants, setTenants] = createSignal<Tenant[]>([]);
  const [editingRole, setEditingRole] = createSignal<Partial<Role> | null>(null);
  const [editingTenant, setEditingTenant] = createSignal<Partial<Tenant> | null>(null);
  const [error, setError] = createSignal('');

  const load = async (): Promise<void> => {
    try {
      setRoles(await apiClient.listRoles());
      setTenants((await apiClient.listTenants({ limit: 100 })).data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  onMount(load);

  return (
    <div class="resource-hub">
      <Show when={error()}><div class="notice notice--error">{error()}</div></Show>
      <div class="access-grid">
        <section class="card">
          <h3>{t('access.roles')}</h3>
          <button class="btn btn-primary" type="button" onClick={() => setEditingRole({ name: '', slug: '', permissions: [] })}>+ {t('common.create')}</button>
          <Show when={editingRole()}>{(role) => (
            <form class="resource-form" onSubmit={(event) => {
              event.preventDefault();
              void (role().id ? apiClient.updateRole(role().id!, role()) : apiClient.createRole(role()))
                .then(() => { setEditingRole(null); return load(); })
                .catch((err) => setError(err instanceof Error ? err.message : String(err)));
            }}>
              <input class="input" required placeholder={t('resources.name')} value={role().name ?? ''} onInput={(event) => setEditingRole({ ...role(), name: event.currentTarget.value })} />
              <input class="input" required placeholder={t('resources.slug')} value={role().slug ?? ''} onInput={(event) => setEditingRole({ ...role(), slug: event.currentTarget.value })} />
              <input class="input" placeholder={t('access.permissions')} value={(role().permissions ?? []).join(', ')} onInput={(event) => setEditingRole({ ...role(), permissions: event.currentTarget.value.split(',').map((value) => value.trim()).filter(Boolean) })} />
              <button class="btn btn-primary" type="submit">{t('common.save')}</button>
            </form>
          )}</Show>
          <table class="table"><tbody><For each={roles()}>{(role) => (
            <tr><td>{role.name}</td><td>{role.slug}</td><td>
              <button class="btn" type="button" onClick={() => setEditingRole(role)}>{t('common.edit')}</button>
              <Show when={!role.is_system}><button class="btn btn-danger" type="button" onClick={() => void apiClient.deleteRole(role.id).then(load)}>{t('common.delete')}</button></Show>
            </td></tr>
          )}</For></tbody></table>
        </section>

        <section class="card">
          <h3>{t('access.tenants')}</h3>
          <button class="btn btn-primary" type="button" onClick={() => setEditingTenant({ name: '', slug: '' })}>+ {t('common.create')}</button>
          <Show when={editingTenant()}>{(tenant) => (
            <form class="resource-form" onSubmit={(event) => {
              event.preventDefault();
              void (tenant().id ? apiClient.updateTenant(tenant().id!, tenant()) : apiClient.createTenant(tenant()))
                .then(() => { setEditingTenant(null); return load(); })
                .catch((err) => setError(err instanceof Error ? err.message : String(err)));
            }}>
              <input class="input" required placeholder={t('resources.name')} value={tenant().name ?? ''} onInput={(event) => setEditingTenant({ ...tenant(), name: event.currentTarget.value })} />
              <input class="input" required placeholder={t('resources.slug')} value={tenant().slug ?? ''} onInput={(event) => setEditingTenant({ ...tenant(), slug: event.currentTarget.value })} />
              <input class="input" placeholder={t('access.domain')} value={tenant().domain ?? ''} onInput={(event) => setEditingTenant({ ...tenant(), domain: event.currentTarget.value })} />
              <button class="btn btn-primary" type="submit">{t('common.save')}</button>
            </form>
          )}</Show>
          <table class="table"><tbody><For each={tenants()}>{(tenant) => (
            <tr><td>{tenant.name}</td><td>{tenant.slug}</td><td>{tenant.status}</td><td>
              <button class="btn" type="button" onClick={() => setEditingTenant(tenant)}>{t('common.edit')}</button>
              <button class="btn btn-danger" type="button" onClick={() => tenant.id && void apiClient.deleteTenant(tenant.id).then(load)}>{t('common.delete')}</button>
            </td></tr>
          )}</For></tbody></table>
        </section>
      </div>
    </div>
  );
}
