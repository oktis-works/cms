// @oktis-works/admin - Post Types Manager (settings)

import { For, Show, createSignal, onMount } from 'solid-js';
import { apiClient, type ContentType } from '../../../lib/api';

const SUPPORTS_OPTIONS = [
  { value: 'title', label: 'Título' },
  { value: 'editor', label: 'Editor' },
  { value: 'thumbnail', label: 'Imagem destacada' },
  { value: 'excerpt', label: 'Resumo' },
  { value: 'revisions', label: 'Revisões' },
] as const;

export function PostTypesManager() {
  const [types, setTypes] = createSignal<ContentType[]>([]);
  const [error, setError] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  const [form, setForm] = createSignal({
    name: '',
    slug: '',
    singularLabel: '',
    pluralLabel: '',
    hasArchive: false,
    supports: ['title', 'editor'] as string[],
  });

  const load = async (): Promise<void> => {
    try {
      setTypes(await apiClient.getContentTypes());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  onMount(load);

  const submit = async (event: Event): Promise<void> => {
    event.preventDefault();
    setError('');
    setSaving(true);

    try {
      await apiClient.createContentType({
        name: form().slug,
        slug: form().slug,
        singularLabel: form().singularLabel,
        pluralLabel: form().pluralLabel,
        hasArchive: form().hasArchive,
        supports: form().supports,
      });
      setForm({ name: '', slug: '', singularLabel: '', pluralLabel: '', hasArchive: false, supports: ['title', 'editor'] });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (slug: string): Promise<void> => {
    try {
      await apiClient.deleteContentType(slug);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div class="post-types-manager">
      <Show when={error()}>
        <div class="notice notice--error">{error()}</div>
      </Show>

      <form class="card" onSubmit={submit}>
        <h3>Criar Content Type</h3>
        <div class="form-grid">
          <label>
            Slug (singular, ex.: portfolio)
            <input
              class="input"
              required
              pattern="[a-z0-9_]+"
              title="Apenas letras minúsculas, números e underscore"
              value={form().slug}
              onInput={(e) => setForm({ ...form(), slug: e.currentTarget.value })}
            />
          </label>
          <label>
            Nome no singular
            <input
              class="input"
              required
              value={form().singularLabel}
              onInput={(e) => setForm({ ...form(), singularLabel: e.currentTarget.value })}
            />
          </label>
          <label>
            Nome no plural
            <input
              class="input"
              required
              value={form().pluralLabel}
              onInput={(e) => setForm({ ...form(), pluralLabel: e.currentTarget.value })}
            />
          </label>
        </div>

        <fieldset class="supports">
          <legend>Suporta</legend>
          <For each={[...SUPPORTS_OPTIONS]}>
            {(option) => (
              <label>
                <input
                  type="checkbox"
                  checked={form().supports.includes(option.value)}
                  onChange={(e) =>
                    setForm({
                      ...form(),
                      supports: e.currentTarget.checked
                        ? [...form().supports, option.value]
                        : form().supports.filter((entry) => entry !== option.value),
                    })
                  }
                />
                {' '}
                {option.label}
              </label>
            )}
          </For>
          <label>
            <input
              type="checkbox"
              checked={form().hasArchive}
              onChange={(e) => setForm({ ...form(), hasArchive: e.currentTarget.checked })}
            />
            {' '}
            Possui arquivo público (/slug)
          </label>
        </fieldset>

        <button type="submit" class="btn btn-primary" disabled={saving()}>
          Criar
        </button>
      </form>

      <table class="table">
        <thead>
          <tr>
            <th>Slug</th>
            <th>Singular</th>
            <th>Plural</th>
            <th>Origem</th>
            <th>Suporta</th>
            <th>Arquivo</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <For each={types()}>
            {(type) => (
              <tr>
                <td>{type.slug}</td>
                <td>{type.singularLabel}</td>
                <td>{type.pluralLabel}</td>
                <td>{type.source ?? 'ADMIN'}</td>
                <td>{(type.supports ?? []).join(', ')}</td>
                <td>{type.hasArchive ? 'Sim' : 'Não'}</td>
                <td>
                  <Show when={type.source !== 'CORE'}>
                    <button type="button" class="btn btn-danger" onClick={() => remove(type.slug)}>
                      Remover
                    </button>
                  </Show>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
