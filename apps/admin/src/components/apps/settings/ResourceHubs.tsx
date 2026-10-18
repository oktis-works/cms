import { For, Show, createSignal, onMount } from 'solid-js';
import { apiClient, type Role, type Tenant } from '../../../lib/api';
import { useTranslation } from '../../../i18n';
import { Modal } from '../../ui/Modal';
import { PermissionPicker } from './PermissionPicker';

export function AccessManager() {
  const { t } = useTranslation();
  const [roles, setRoles] = createSignal<Role[]>([]);
  const [tenants, setTenants] = createSignal<Tenant[]>([]);
  const [editingRole, setEditingRole] = createSignal<Partial<Role> | null>(null);
  const [editingTenant, setEditingTenant] = createSignal<Partial<Tenant> | null>(null);
  const [saving, setSaving] = createSignal(false);
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

  const saveRole = (event: Event): void => {
    event.preventDefault();
    const role = editingRole();
    if (!role) return;
    setSaving(true);
    void (role.id ? apiClient.updateRole(role.id, role) : apiClient.createRole(role))
      .then(() => {
        setEditingRole(null);
        return load();
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
  };

  const saveTenant = (event: Event): void => {
    event.preventDefault();
    const tenant = editingTenant();
    if (!tenant) return;
    setSaving(true);
    void (tenant.id ? apiClient.updateTenant(tenant.id, tenant) : apiClient.createTenant(tenant))
      .then(() => {
        setEditingTenant(null);
        return load();
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
  };

  const permissionsSummary = (role: Role): string => {
    const list = role.permissions ?? [];
    if (list.length === 0) return '—';
    return list.slice(0, 4).join(', ') + (list.length > 4 ? ` +${list.length - 4}` : '');
  };

  return (
    <div class="resource-hub">
      <Show when={error()}><div class="notice notice--error">{error()}</div></Show>
      <div class="access-grid">
        <section class="card">
          <div class="card-header-row">
            <h3>{t('access.roles')}</h3>
            <button class="btn btn-primary" type="button" onClick={() => setEditingRole({ name: '', slug: '', permissions: [] })}>
              + {t('common.create')}
            </button>
          </div>

          <table class="table">
            <thead>
              <tr>
                <th>{t('resources.name')}</th>
                <th>{t('resources.slug')}</th>
                <th>{t('access.permissions')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <For each={roles()}>
                {(role) => (
                  <tr>
                    <td>{role.name}</td>
                    <td><code>{role.slug}</code></td>
                    <td class="access-permissions-cell" title={(role.permissions ?? []).join(', ')}>
                      {permissionsSummary(role)}
                    </td>
                    <td class="access-actions">
                      <button class="btn btn-secondary btn-sm" type="button" onClick={() => setEditingRole({ ...role, permissions: [...(role.permissions ?? [])] })}>
                        {t('common.edit')}
                      </button>
                      <Show when={!role.is_system}>
                        <button class="btn btn-danger btn-sm" type="button" onClick={() => void apiClient.deleteRole(role.id).then(load)}>
                          {t('common.delete')}
                        </button>
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>

          <Modal
            open={editingRole() !== null}
            onClose={() => setEditingRole(null)}
            title={editingRole()?.id ? t('access.editRole') : t('access.newRole')}
          >
            <Show when={editingRole()}>
              {(role) => (
                <form class="resource-form" onSubmit={saveRole}>
                  <label>
                    <span class="resource-form__label">{t('resources.name')}</span>
                    <input
                      class="input"
                      required
                      placeholder={t('resources.name')}
                      value={role().name ?? ''}
                      onInput={(event) => setEditingRole({ ...role(), name: event.currentTarget.value })}
                    />
                  </label>
                  <label>
                    <span class="resource-form__label">{t('resources.slug')}</span>
                    <input
                      class="input"
                      required
                      placeholder={t('resources.slug')}
                      value={role().slug ?? ''}
                      onInput={(event) => setEditingRole({ ...role(), slug: event.currentTarget.value })}
                    />
                  </label>
                  <div class="resource-form__field">
                    <span class="resource-form__label">{t('access.permissions')}</span>
                    <PermissionPicker
                      value={role().permissions ?? []}
                      onChange={(permissions) => setEditingRole({ ...role(), permissions })}
                    />
                  </div>
                  <div class="form-actions">
                    <button class="btn btn-secondary" type="button" onClick={() => setEditingRole(null)}>
                      {t('common.cancel')}
                    </button>
                    <button class="btn btn-primary" type="submit" disabled={saving()}>
                      {saving() ? t('common.loading') : t('common.save')}
                    </button>
                  </div>
                </form>
              )}
            </Show>
          </Modal>
        </section>

        <section class="card">
          <div class="card-header-row">
            <h3>{t('access.tenants')}</h3>
            <button class="btn btn-primary" type="button" onClick={() => setEditingTenant({ name: '', slug: '' })}>
              + {t('common.create')}
            </button>
          </div>

          <table class="table">
            <thead>
              <tr>
                <th>{t('resources.name')}</th>
                <th>{t('resources.slug')}</th>
                <th>{t('common.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <For each={tenants()}>
                {(tenant) => (
                  <tr>
                    <td>{tenant.name}</td>
                    <td><code>{tenant.slug}</code></td>
                    <td>{tenant.status}</td>
                    <td class="access-actions">
                      <button class="btn btn-secondary btn-sm" type="button" onClick={() => setEditingTenant({ ...tenant })}>
                        {t('common.edit')}
                      </button>
                      <button class="btn btn-danger btn-sm" type="button" onClick={() => tenant.id && void apiClient.deleteTenant(tenant.id).then(load)}>
                        {t('common.delete')}
                      </button>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>

          <Modal
            open={editingTenant() !== null}
            onClose={() => setEditingTenant(null)}
            title={editingTenant()?.id ? t('access.editTenant') : t('access.newTenant')}
          >
            <Show when={editingTenant()}>
              {(tenant) => (
                <form class="resource-form" onSubmit={saveTenant}>
                  <label>
                    <span class="resource-form__label">{t('resources.name')}</span>
                    <input
                      class="input"
                      required
                      placeholder={t('resources.name')}
                      value={tenant().name ?? ''}
                      onInput={(event) => setEditingTenant({ ...tenant(), name: event.currentTarget.value })}
                    />
                  </label>
                  <label>
                    <span class="resource-form__label">{t('resources.slug')}</span>
                    <input
                      class="input"
                      required
                      placeholder={t('resources.slug')}
                      value={tenant().slug ?? ''}
                      onInput={(event) => setEditingTenant({ ...tenant(), slug: event.currentTarget.value })}
                    />
                  </label>
                  <label>
                    <span class="resource-form__label">{t('access.domain')}</span>
                    <input
                      class="input"
                      placeholder={t('access.domain')}
                      value={tenant().domain ?? ''}
                      onInput={(event) => setEditingTenant({ ...tenant(), domain: event.currentTarget.value })}
                    />
                  </label>
                  <div class="form-actions">
                    <button class="btn btn-secondary" type="button" onClick={() => setEditingTenant(null)}>
                      {t('common.cancel')}
                    </button>
                    <button class="btn btn-primary" type="submit" disabled={saving()}>
                      {saving() ? t('common.loading') : t('common.save')}
                    </button>
                  </div>
                </form>
              )}
            </Show>
          </Modal>
        </section>
      </div>
    </div>
  );
}
