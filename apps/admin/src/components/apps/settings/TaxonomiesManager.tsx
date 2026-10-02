// @oktis-works/admin - Taxonomies Manager (settings)

import { For, Show, createSignal, onMount } from 'solid-js';
import { apiClient, type ContentType, type Taxonomy } from '../../../lib/api';

export function TaxonomiesManager() {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const remove = async (slug: string): Promise<void> => {
    try {
      await apiClient.deleteTaxonomy(slug);
      await load();
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
        <h3>Criar Taxonomia</h3>
        <div class="form-grid">
          <label>
            Nome (ex.: Gênero)
            <input
              class="input"
              required
              value={form().name}
              onInput={(e) => setForm({ ...form(), name: e.currentTarget.value })}
            />
          </label>
          <label>
            Slug (opcional, gerado do nome)
            <input
              class="input"
              pattern="[a-z0-9_]*"
              title="Apenas letras minúsculas, números e underscore"
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
            Hierárquica (permite termos pai/filho)
          </label>
        </div>

        <fieldset>
          <legend>Vincular aos content types</legend>
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
          Criar
        </button>
      </form>

      <table class="table">
        <thead>
          <tr>
            <th>Taxonomia</th>
            <th>Hierárquica</th>
            <th>Content types vinculados</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <For each={taxonomies()}>
            {(taxonomy) => (
              <tr>
                <td>{taxonomy.name} ({taxonomy.slug})</td>
                <td>{taxonomy.hierarchical ? 'Sim' : 'Não'}</td>
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
