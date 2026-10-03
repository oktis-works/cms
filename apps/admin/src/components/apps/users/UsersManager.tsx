// @oktis-works/admin - Users Manager (lista, papel, senha, status, exclusão)

import { For, Show, createSignal, onMount } from 'solid-js';
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

  const totalPages = (): number => Math.max(1, Math.ceil(total() / limit));

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
        <input
          class="input"
          placeholder="Buscar por nome ou email…"
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && void searchNow()}
        />
        <select
          class="input"
          value={status()}
          onChange={(e) => {
            setStatus(e.currentTarget.value);
            void searchNow();
          }}
        >
          <option value="">Todos os status</option>
          <option value="ACTIVE">Ativos</option>
          <option value="INACTIVE">Inativos</option>
        </select>
        <a class="btn btn-primary" href="/users/new">+ Novo usuário</a>
        <button class="btn btn-secondary" type="button" onClick={() => void searchNow()}>
          Buscar
        </button>
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
                      <span class="badge">{user.roles.join(', ')}</span>
                    </Show>
                  </td>
                  <td>
                    <span classList={{ 'status-dot': true, 'status-dot--active': user.status === 'ACTIVE' }}></span>
                    {user.status}
                  </td>
                  <td class="muted">{formatDate(user.last_login_at)}</td>
                  <td class="users-table__actions">
                    <button class="btn btn-secondary btn-sm" type="button" onClick={() => setSelected(user)}>
                      Gerenciar
                    </button>
                    <button class="btn btn-danger btn-sm" type="button" onClick={() => void removeUser(user)}>
                      Excluir
                    </button>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>

      <Show when={totalPages() > 1}>
        <div class="pagination">
          <button class="btn btn-secondary btn-sm" type="button" disabled={page() <= 1} onClick={() => { setPage(page() - 1); void load(); }}>
            ← Anterior
          </button>
          <span class="muted">Página {page()} de {totalPages()}</span>
          <button class="btn btn-secondary btn-sm" type="button" disabled={page() >= totalPages()} onClick={() => { setPage(page() + 1); void load(); }}>
            Próxima →
          </button>
        </div>
      </Show>

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
              <button class="btn btn-primary" type="button" disabled={busy()} onClick={() => void saveUser(user())}>
                {busy() ? 'Salvando…' : 'Salvar'}
              </button>
              <button class="btn btn-secondary" type="button" disabled={busy()} onClick={() => void resetPassword(user())}>
                Redefinir senha
              </button>
              <button class="btn btn-secondary" type="button" onClick={() => setSelected(null)}>
                Fechar
              </button>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
