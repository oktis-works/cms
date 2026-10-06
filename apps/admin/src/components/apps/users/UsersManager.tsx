// @oktis-works/admin - Users Manager (lista, papel, senha, status, exclusão)
// Migrada para o design-system @oktis-works/ui (Button/Input/Select/Pagination/Badge).

import { For, Show, createSignal, onMount } from '@oktis-works/ui';
import { Button, Input, Select, Pagination, Badge } from '@oktis-works/ui';
import { apiClient, type AdminUser, type Role } from '../../../lib/api';
import { useTranslation } from '../../../i18n';

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

export function UsersManager() {
  const { t } = useTranslation();
  const [users, setUsers] = createSignal<AdminUser[]>([]);
  const [roles, setRoles] = createSignal<Role[]>([]);
  const [total, setTotal] = createSignal(0);
  const [page, setPage] = createSignal(1);
  const [search, setSearch] = createSignal('');
  const [status, setStatus] = createSignal('');
  const [error, setError] = createSignal('');
  const [info, setInfo] = createSignal('');
  const [selected, setSelected] = createSignal<AdminUser | null>(null);
  const [busy, setBusy] = createSignal(false);

  const limit = 20;

  const load = async (): Promise<void> => {
    try {
      const result = await apiClient.listUsers({
        page: page(),
        limit,
        search: search() || undefined,
        status: status() || undefined,
      });
      setUsers(result.data ?? []);
      setTotal(result.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  onMount(async () => {
    await load();
    try {
      setRoles(await apiClient.listRoles());
    } catch {
      // papéis são opcional na tela — o assign continua funcionando com id
    }
  });

  const searchNow = async (): Promise<void> => {
    setPage(1);
    await load();
  };

  const assignRole = async (user: AdminUser, roleId: string): Promise<void> => {
    if (!roleId) return;
    setBusy(true);
    setError('');
    try {
      const result = await apiClient.assignRole(user.id, roleId);
      setSelected({ ...user, roles: result.roles });
      setInfo(t('users.detail.toasts.roleUpdated', { name: user.name }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (user: AdminUser): Promise<void> => {
    const password = prompt(t('users.detail.passwordPrompt', { email: user.email }));
    if (!password) return;
    if (password.length < 8) {
      setError(t('users.detail.passwordError'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiClient.setUserPassword(user.id, password);
      setInfo(t('users.detail.toasts.passwordChanged', { name: user.name }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const saveUser = async (user: AdminUser): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      await apiClient.updateUser(user.id, {
        name: user.name,
        email: user.email,
        status: user.status,
      });
      setInfo(t('users.detail.toasts.saved', { name: user.name }));
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const removeUser = async (user: AdminUser): Promise<void> => {
    if (!confirm(t('users.detail.confirmDelete', { email: user.email }))) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.deleteUser(user.id);
      if (selected()?.id === user.id) setSelected(null);
      setInfo(t('users.detail.toasts.deleted', { name: user.name }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const currentRole = (user: AdminUser): Role | undefined =>
    roles().find((r) => r.slug === user.roles[0]);

  return (
    <div class="users-manager">
      <Show when={error()}>
        <div class="notice notice--error">{error()}</div>
      </Show>
      <Show when={info()}>
        <div class="notice">{info()}</div>
      </Show>

      <div class="toolbar">
        <Input
          name="user-search"
          placeholder={t('users.toolbar.search')}
          value={search()}
          onInput={(value) => {
            setSearch(value);
            void searchNow();
          }}
        />
        <Select
          name="user-status"
          placeholder={t('users.toolbar.allStatus')}
          value={status()}
          options={[
            { value: 'ACTIVE', label: t('users.toolbar.active') },
            { value: 'INACTIVE', label: t('users.toolbar.inactive') },
          ]}
          onChange={(value) => {
            setStatus(value);
            void searchNow();
          }}
        />
        <a class="btn btn-primary" href="/users/new">{t('users.toolbar.newBtn')}</a>
        <Button variant="secondary" onClick={() => void searchNow()}>
          {t('users.toolbar.searchBtn')}
        </Button>
      </div>

      <Show when={users().length > 0} fallback={<p class="muted">{t('users.empty')}</p>}>
        <table class="users-table">
          <thead>
            <tr>
              <th>{t('users.table.name')}</th>
              <th>{t('users.table.email')}</th>
              <th>{t('users.table.role')}</th>
              <th>{t('users.table.status')}</th>
              <th>{t('users.table.lastAccess')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <For each={users()}>
              {(user) => (
                <tr classList={{ 'users-table__row--selected': selected()?.id === user.id }}>
                  <td>{user.name}</td>
                  <td class="muted">{user.email}</td>
                  <td>
                    <Show when={user.roles.length > 0} fallback={<span class="muted">{t('users.noRole')}</span>}>
                      <Badge>{user.roles.join(', ')}</Badge>
                    </Show>
                  </td>
                  <td>
                    <span classList={{ 'status-dot': true, 'status-dot--active': user.status === 'ACTIVE' }}></span>
                    {t('common.status.' + user.status.toLowerCase())}
                  </td>
                  <td class="muted">{formatDate(user.last_login_at)}</td>
                  <td class="users-table__actions">
                    <Button variant="secondary" size="sm" onClick={() => setSelected(user)}>
                      {t('users.table.actions.manage')}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => void removeUser(user)}>
                      {t('users.table.actions.delete')}
                    </Button>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>

      <Pagination
        page={page()}
        limit={limit}
        total={total()}
        onPageChange={(next) => {
          setPage(next);
          void load();
        }}
      />

      <Show when={selected()}>
        {(user) => (
          <div class="card user-details">
            <h3>{t('users.detail.title')}</h3>

            <div class="form-grid">
              <label>
                {t('users.detail.fields.name')}
                <input
                  class="input"
                  value={user().name}
                  onInput={(e) => setSelected({ ...user(), name: e.currentTarget.value })}
                />
              </label>
              <label>
                {t('users.detail.fields.email')}
                <input
                  class="input"
                  type="email"
                  value={user().email}
                  onInput={(e) => setSelected({ ...user(), email: e.currentTarget.value })}
                />
              </label>
              <label>
                {t('users.detail.fields.status')}
                <select
                  class="input"
                  value={user().status}
                  onChange={(e) => setSelected({ ...user(), status: e.currentTarget.value })}
                >
                  <option value="ACTIVE">{t('users.detail.statusOptions.active')}</option>
                  <option value="INACTIVE">{t('users.detail.statusOptions.inactive')}</option>
                </select>
              </label>
              <label>
                {t('users.detail.fields.role')}
                <select
                  class="input"
                  value={currentRole(user())?.id ?? ''}
                  onChange={(e) => void assignRole(user(), e.currentTarget.value)}
                  disabled={busy()}
                >
                  <option value="">{t('users.detail.rolePlaceholder')}</option>
                  <For each={roles()}>{(role) => <option value={role.id}>{role.name} ({role.slug})</option>}</For>
                </select>
              </label>
            </div>

            <p class="muted">{t('users.detail.meta', { created: formatDate(user().created_at), lastAccess: formatDate(user().last_login_at) })}</p>

            <div class="media-details__actions">
              <Button variant="primary" disabled={busy()} loading={busy()} onClick={() => void saveUser(user())}>
                {t('users.detail.actions.save')}
              </Button>
              <Button variant="secondary" disabled={busy()} onClick={() => void resetPassword(user())}>
                {t('users.detail.actions.resetPassword')}
              </Button>
              <Button variant="secondary" onClick={() => setSelected(null)}>
                {t('users.detail.actions.close')}
              </Button>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}