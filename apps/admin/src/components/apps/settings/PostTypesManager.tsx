// @oktis-works/admin - Post Types Manager (settings)

import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { apiClient, type ContentType } from '../../../lib/api';
import { useTranslation } from '../../../i18n';

export function PostTypesManager() {
  const { t } = useTranslation();
  const [types, setTypes] = createSignal<ContentType[]>([]);
  const [error, setError] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  const [editingSlug, setEditingSlug] = createSignal<string | null>(null);

  const supportsOptions = createMemo(() => [
    { value: 'title', label: t('settings.postTypes.form.supportsOptions.title') },
    { value: 'editor', label: t('settings.postTypes.form.supportsOptions.editor') },
    { value: 'thumbnail', label: t('settings.postTypes.form.supportsOptions.thumbnail') },
    { value: 'excerpt', label: t('settings.postTypes.form.supportsOptions.excerpt') },
    { value: 'revisions', label: t('settings.postTypes.form.supportsOptions.revisions') },
  ] as const);

  const [form, setForm] = createSignal({
    name: '',
    slug: '',
    singularLabel: '',
    pluralLabel: '',
    hasArchive: false,
    singleton: false,
    menuIcon: 'box',
    supports: ['title', 'editor'] as string[],
  });

  const resetForm = (): void => {
    setEditingSlug(null);
    setForm({ name: '', slug: '', singularLabel: '', pluralLabel: '', hasArchive: false, singleton: false, menuIcon: 'box', supports: ['title', 'editor'] });
  };

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
      const payload = {
        name: form().name || form().slug,
        slug: form().slug,
        singularLabel: form().singularLabel,
        pluralLabel: form().pluralLabel,
        hasArchive: form().hasArchive,
        singleton: form().singleton,
        menuIcon: form().menuIcon || 'box',
        supports: form().supports,
      };
      if (editingSlug()) {
        await apiClient.updateContentType(editingSlug()!, payload);
      } else {
        await apiClient.createContentType(payload);
      }
      resetForm();
      await load();
      window.dispatchEvent(new Event('okcms:content-models-changed'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const edit = (type: ContentType): void => {
    setEditingSlug(type.slug);
    setForm({
      name: type.name,
      slug: type.slug,
      singularLabel: type.singularLabel,
      pluralLabel: type.pluralLabel,
      hasArchive: type.hasArchive ?? false,
      singleton: type.singleton ?? false,
      menuIcon: type.menuIcon ?? 'box',
      supports: [...(type.supports ?? ['title', 'editor'])],
    });
  };

  const remove = async (slug: string): Promise<void> => {
    try {
      await apiClient.deleteContentType(slug);
      await load();
      window.dispatchEvent(new Event('okcms:content-models-changed'));
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
        <h3>{editingSlug() ? t('settings.postTypes.form.editTitle') : t('settings.postTypes.form.title')}</h3>
        <div class="form-grid">
          <label>
            {t('settings.postTypes.form.slug')}
            <input
              class="input"
              required
              pattern="[a-z0-9_]+"
              title={t('settings.postTypes.form.slugHint')}
              value={form().slug}
              onInput={(e) => setForm({ ...form(), slug: e.currentTarget.value })}
            />
          </label>
          <label>
            {t('settings.postTypes.form.singular')}
            <input
              class="input"
              required
              value={form().singularLabel}
              onInput={(e) => setForm({ ...form(), singularLabel: e.currentTarget.value })}
            />
          </label>
          <label>
            {t('settings.postTypes.form.plural')}
            <input
              class="input"
              required
              value={form().pluralLabel}
              onInput={(e) => setForm({ ...form(), pluralLabel: e.currentTarget.value })}
            />
          </label>
          <label>
            {t('settings.postTypes.form.icon')}
            <input class="input" value={form().menuIcon} placeholder="box" onInput={(e) => setForm({ ...form(), menuIcon: e.currentTarget.value })} />
            <small class="muted">{t('settings.postTypes.form.iconHint')}</small>
          </label>
        </div>

        <fieldset class="supports">
          <legend>{t('settings.postTypes.form.supports')}</legend>
          <For each={supportsOptions()}>
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
            {t('settings.postTypes.form.hasArchive')}
          </label>
          <label>
            <input type="checkbox" checked={form().singleton} onChange={(e) => setForm({ ...form(), singleton: e.currentTarget.checked })} />
            {' '}
            {t('settings.postTypes.form.singleton')}
          </label>
        </fieldset>

        <button type="submit" class="btn btn-primary" disabled={saving()}>
          {editingSlug() ? t('settings.postTypes.form.update') : t('settings.postTypes.form.create')}
        </button>
        <Show when={editingSlug()}>
          <button type="button" class="btn btn-secondary" onClick={resetForm}>{t('settings.postTypes.form.cancel')}</button>
        </Show>
      </form>

      <table class="table">
        <thead>
          <tr>
            <th>{t('settings.postTypes.table.slug')}</th>
            <th>{t('settings.postTypes.table.singular')}</th>
            <th>{t('settings.postTypes.table.plural')}</th>
            <th>{t('settings.postTypes.table.source')}</th>
            <th>{t('settings.postTypes.table.supports')}</th>
            <th>{t('settings.postTypes.table.archive')}</th>
            <th>{t('settings.postTypes.table.mode')}</th>
            <th>{t('settings.postTypes.table.icon')}</th>
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
                <td>{type.source ?? t('settings.postTypes.sources.admin')}</td>
                <td>{(type.supports ?? []).join(', ')}</td>
                <td>{type.hasArchive ? t('common.yes') : t('common.no')}</td>
                <td>{type.singleton ? t('settings.postTypes.table.singleton') : t('settings.postTypes.table.collection')}</td>
                <td>{type.menuIcon ?? 'box'}</td>
                <td>
                  <button type="button" class="btn btn-secondary" onClick={() => edit(type)}>
                    {t('settings.postTypes.table.actions.edit')}
                  </button>{' '}
                  <Show when={type.source !== 'CORE'}>
                    <button type="button" class="btn btn-danger" onClick={() => remove(type.slug)}>
                      {t('settings.postTypes.table.actions.remove')}
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
