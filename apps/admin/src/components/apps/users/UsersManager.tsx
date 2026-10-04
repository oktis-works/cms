// @oktis-works/admin - Users Manager (lista, papel, senha, status, exclusão)
// Migrada para o design-system @oktis-works/ui (Button/Input/Select/Pagination/Badge).

import { For, Show, createSignal, onMount } from '@oktis-works/ui';
import { Button, Input, Select, Pagination, Badge } from '@oktis-works/ui';
import { apiClient, type AdminUser, type Role } from '../../../lib/api';

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

export function UsersManager() {
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
      setInfo(`Papel de ${user.name} atualizado ✓`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (user: AdminUser): Promise<void> => {
    const password = prompt(`Nova senha para ${user.email} (mínimo 8 caracteres):`);
    if (!password) return;
    if (password.length < 8) {
      setError('A senha precisa de pelo menos 8 caracteres');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiClient.setUserPassword(user.id, password);
      setInfo(`Senha de ${user.name} alterada ✓`);
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
      setInfo(`Usuário ${user.name} salvo ✓`);
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const removeUser = async (user: AdminUser): Promise<void> => {
    if (!confirm(`Excluir o usuário ${user.email}?`)) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.deleteUser(user.id);
      if (selected()?.id === user.id) setSelected(null);
      setInfo(`Usuário ${user.name} excluído ✓`);
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
          placeholder="Buscar por nome ou email…"
          value={search()}
          onInput={(value) => {
            setSearch(value);
            void searchNow();
          }}
        />
        <Select
          name="user-status"
          placeholder="Todos os status"
          value={status()}
          options={[
            { value: 'ACTIVE', label: 'Ativos' },
            { value: 'INACTIVE', label: 'Inativos' },
          ]}
          onChange={(value) => {
            setStatus(value);
            void searchNow();
          }}
        />
        <a class="btn btn-primary" href="/users/new">+ Novo usuário</a>
        <Button variant="secondary" onClick={() => void searchNow()}>
          Buscar
        </Button>
      </div>

      <Show when={users().length > 0} fallback={<p class="muted">Nenhum usuário encontrado.</p>}>
        <table class="users-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Papel</th>
              <th>Status</th>
              <th>Último acesso</th>
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
                    <Show when={user.roles.length > 0} fallback={<span class="muted">sem papel</span>}>
                      <Badge>{user.roles.join(', ')}</Badge>
                    </Show>
                  </td>
                  <td>
                    <span classList={{ 'status-dot': true, 'status-dot--active': user.status === 'ACTIVE' }}></span>
                    {user.status}
                  </td>
                  <td class="muted">{formatDate(user.last_login_at)}</td>
                  <td class="users-table__actions">
                    <Button variant="secondary" size="sm" onClick={() => setSelected(user)}>
                      Gerenciar
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => void removeUser(user)}>
                      Excluir
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
            <h3>Gerenciar usuário</h3>

            <div class="form-grid">
              <label>
                Nome
                <input
                  class="input"
                  value={user().name}
                  onInput={(e) => setSelected({ ...user(), name: e.currentTarget.value })}
                />
              </label>
              <label>
                Email
                <input
                  class="input"
                  type="email"
                  value={user().email}
                  onInput={(e) => setSelected({ ...user(), email: e.currentTarget.value })}
                />
              </label>
              <label>
                Status
                <select
                  class="input"
                  value={user().status}
                  onChange={(e) => setSelected({ ...user(), status: e.currentTarget.value })}
                >
                  <option value="ACTIVE">Ativo</option>
                  <option value="INACTIVE">Inativo</option>
                </select>
              </label>
              <label>
                Papel
                <select
                  class="input"
                  value={currentRole(user())?.id ?? ''}
                  onChange={(e) => void assignRole(user(), e.currentTarget.value)}
                  disabled={busy()}
                >
                  <option value="">— sem papel —</option>
                  <For each={roles()}>{(role) => <option value={role.id}>{role.name} ({role.slug})</option>}</For>
                </select>
              </label>
            </div>

            <p class="muted">Criado em {formatDate(user().created_at)} · último acesso {formatDate(user().last_login_at)}</p>

            <div class="media-details__actions">
              <Button variant="primary" disabled={busy()} loading={busy()} onClick={() => void saveUser(user())}>
                Salvar
              </Button>
              <Button variant="secondary" disabled={busy()} onClick={() => void resetPassword(user())}>
                Redefinir senha
              </Button>
              <Button variant="secondary" onClick={() => setSelected(null)}>
                Fechar
              </Button>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
