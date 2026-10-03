// @oktis-works/admin - Form de criação de usuário (/users/new)

import { For, Show, createSignal, onMount } from 'solid-js';
import { apiClient, type Role } from '../../../lib/api';

export function UserCreateForm() {
  const [name, setName] = createSignal('');
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [roleId, setRoleId] = createSignal('');
  const [roles, setRoles] = createSignal<Role[]>([]);
  const [error, setError] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  onMount(async () => {
    try {
      const all = await apiClient.listRoles();
      setRoles(all);
      setRoleId(all.find((r) => r.slug === 'EDITOR')?.id ?? all[0]?.id ?? '');
    } catch {
      // sem lista de papéis o form ainda cria (papel opcional)
    }
  });

  const submit = async (event: Event): Promise<void> => {
    event.preventDefault();
    setError('');

    if (password().length < 8) {
      setError('A senha precisa de pelo menos 8 caracteres');
      return;
    }

    setSaving(true);
    try {
      await apiClient.createUser({
        name: name(),
        email: email(),
        password: password(),
        roleId: roleId() || undefined,
      });
      window.location.href = '/users';
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <div class="user-create">
      <Show when={error()}>
        <div class="notice notice--error">{error()}</div>
      </Show>

      <form class="card" onSubmit={submit}>
        <h3>Novo usuário</h3>
        <div class="form-grid">
          <label>
            Nome
            <input class="input" required value={name()} onInput={(e) => setName(e.currentTarget.value)} />
          </label>
          <label>
            Email
            <input class="input" type="email" required value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
          </label>
          <label>
            Senha <span class="muted">(mínimo 8 caracteres)</span>
            <input
              class="input"
              type="password"
              required
              minlength={8}
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
            />
          </label>
          <label>
            Papel
            <select class="input" value={roleId()} onChange={(e) => setRoleId(e.currentTarget.value)}>
              <option value="">— nenhum (só leitura futura) —</option>
              <For each={roles()}>{(role) => <option value={role.id}>{role.name} ({role.slug})</option>}</For>
            </select>
          </label>
        </div>
        <p class="muted">
          O papel define o que o usuário pode fazer (o primeiro usuário do projeto já nasce como
          Administrador).
        </p>
        <div class="media-details__actions">
          <button class="btn btn-primary" type="submit" disabled={saving()}>
            {saving() ? 'Criando…' : 'Criar usuário'}
          </button>
          <a class="btn btn-secondary" href="/users">Voltar</a>
        </div>
      </form>
    </div>
  );
}
