// @oktis-works/admin - Form de criação de usuário (/users/new)

import { For, Show, createSignal, onMount } from 'solid-js';
import { apiClient, type Role } from '../../../lib/api';
import { useTranslation } from '../../../i18n';

export function UserCreateForm() {
  const { t } = useTranslation();
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
      setError(t('users.detail.passwordError'));
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
        <h3>{t('users.new')}</h3>
        <div class="form-grid">
          <label>
            {t('users.detail.fields.name')}
            <input class="input" required value={name()} onInput={(e) => setName(e.currentTarget.value)} />
          </label>
          <label>
            {t('users.detail.fields.email')}
            <input class="input" type="email" required value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
          </label>
          <label>
            {t('users.detail.fields.password')}
            <span class="muted">{t('users.detail.passwordPrompt', { email: '' })}</span>
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
            {t('users.detail.fields.role')}
            <select class="input" value={roleId()} onChange={(e) => setRoleId(e.currentTarget.value)}>
              <option value="">{t('users.detail.rolePlaceholder')}</option>
              <For each={roles()}>{(role) => <option value={role.id}>{role.name} ({role.slug})</option>}</For>
            </select>
          </label>
        </div>
        <p class="muted">
          {t('common.save')} {t('users.new').toLowerCase()} — {t('users.detail.fields.role')} {t('users.toolbar.newBtn').toLowerCase()}.
        </p>
        <div class="media-details__actions">
          <button class="btn btn-primary" type="submit" disabled={saving()}>
            {saving() ? t('common.loading') : t('common.create')}
          </button>
          <a class="btn btn-secondary" href="/users">{t('common.back')}</a>
        </div>
      </form>
    </div>
  );
}