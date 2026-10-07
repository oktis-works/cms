// @oktis-works/admin - Taxonomies Manager (settings)

import { For, Show, createSignal, onMount } from 'solid-js';
import { apiClient, type ContentType, type Taxonomy } from '../../../lib/api';
import { useTranslation } from '../../../i18n';

export function TaxonomiesManager() {
  const { t } = useTranslation();
  const [taxonomies, setTaxonomies] = createSignal<Taxonomy[]>([]);
  const [contentTypes, setContentTypes] = createSignal<ContentType[]>([]);
  const [error, setError] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  const [form, setForm] = createSignal({
    name: '',
    slug: '',
    hierarchical: false,
    attachTo: [] as string[],
  });

  const load = async (): Promise<void> => {
    try {
      const [taxonomyList, typeList] = await Promise.all([
        apiClient.getTaxonomies(),
        apiClient.getContentTypes(),
      ]);
      setTaxonomies(taxonomyList);
      setContentTypes(typeList);
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
      await apiClient.createTaxonomy({
        name: form().name,
        slug: form().slug || undefined,
        hierarchical: form().hierarchical,
        attachTo: form().attachTo,
        labels: { singular_name: form().name },
      });
      setForm({ name: '', slug: '', hierarchical: false, attachTo: [] });
      await load();
      window.dispatchEvent(new Event('okcms:content-models-changed'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleAttach = async (taxonomy: Taxonomy, contentTypeSlug: string): Promise<void> => {
    const attached = taxonomy.attachTo?.includes(contentTypeSlug);

    try {
      if (attached) {
        await apiClient.detachTaxonomy(taxonomy.slug, contentTypeSlug);
      } else {
        await apiClient.attachTaxonomy(taxonomy.slug, contentTypeSlug);
      }
      await load();
      window.dispatchEvent(new Event('okcms:content-models-changed'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const remove = async (slug: string): Promise<void> => {
    try {
      await apiClient.deleteTaxonomy(slug);
      await load();
      window.dispatchEvent(new Event('okcms:content-models-changed'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div class="taxonomies-manager">
      <Show when={error()}>
        <div class="notice notice--error">{error()}</div>
      </Show>

      <form class="card" onSubmit={submit}>
        <h3>{t('settings.taxonomies.form.title')}</h3>
        <div class="form-grid">
          <label>
            {t('settings.taxonomies.form.name')}
            <input
              class="input"
              required
              value={form().name}
              onInput={(e) => setForm({ ...form(), name: e.currentTarget.value })}
            />
          </label>
          <label>
            {t('settings.taxonomies.form.slug')}
            <input
              class="input"
              pattern="[a-z0-9_]*"
              title={t('settings.taxonomies.form.slugHint')}
              value={form().slug}
              onInput={(e) => setForm({ ...form(), slug: e.currentTarget.value })}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={form().hierarchical}
              onChange={(e) => setForm({ ...form(), hierarchical: e.currentTarget.checked })}
            />
            {' '}
            {t('settings.taxonomies.form.hierarchical')}
          </label>
        </div>

        <fieldset>
          <legend>{t('settings.taxonomies.form.attachTo')}</legend>
          <For each={contentTypes()}>
            {(type) => (
              <label>
                <input
                  type="checkbox"
                  checked={form().attachTo.includes(type.slug)}
                  onChange={(e) =>
                    setForm({
                      ...form(),
                      attachTo: e.currentTarget.checked
                        ? [...form().attachTo, type.slug]
                        : form().attachTo.filter((entry) => entry !== type.slug),
                    })
                  }
                />
                {' '}
                {type.pluralLabel} ({type.slug})
              </label>
            )}
          </For>
        </fieldset>

        <button type="submit" class="btn btn-primary" disabled={saving()}>
          {t('settings.taxonomies.form.create')}
        </button>
      </form>

      <table class="table">
        <thead>
          <tr>
            <th>{t('settings.taxonomies.table.taxonomy')}</th>
            <th>{t('settings.taxonomies.table.hierarchical')}</th>
            <th>{t('settings.taxonomies.table.attachedTypes')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <For each={taxonomies()}>
            {(taxonomy) => (
              <tr>
                <td>{taxonomy.name} ({taxonomy.slug})</td>
                <td>{taxonomy.hierarchical ? t('common.yes') : t('common.no')}</td>
                <td>
                  <For each={contentTypes()}>
                    {(type) => (
                      <label style={{ 'margin-right': '0.75rem' }}>
                        <input
                          type="checkbox"
                          checked={taxonomy.attachTo?.includes(type.slug) ?? false}
                          onChange={() => toggleAttach(taxonomy, type.slug)}
                        />
                        {' '}
                        {type.slug}
                      </label>
                    )}
                  </For>
                </td>
                <td>
                  <Show when={taxonomy.source !== 'CORE'}>
                    <button type="button" class="btn btn-danger" onClick={() => remove(taxonomy.slug)}>
                      {t('settings.taxonomies.table.actions.remove')}
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
