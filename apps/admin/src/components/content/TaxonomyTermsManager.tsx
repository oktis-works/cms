// @oktis-works/admin - WordPress-style taxonomy term manager

import { For, Show, createSignal, onMount } from 'solid-js';
import { apiClient, type Taxonomy, type TaxonomyTerm } from '../../lib/api';
import { useTranslation } from '../../i18n';

interface Props {
  taxonomySlug: string;
  contentType?: string;
}

export function TaxonomyTermsManager(props: Props) {
  const { t } = useTranslation();
  const [taxonomy, setTaxonomy] = createSignal<Taxonomy | null>(null);
  const [terms, setTerms] = createSignal<TaxonomyTerm[]>([]);
  const [name, setName] = createSignal('');
  const [slug, setSlug] = createSignal('');
  const [description, setDescription] = createSignal('');
  const [error, setError] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  const load = async (): Promise<void> => {
    if (!props.taxonomySlug) return;
    try {
      const [allTaxonomies, taxonomyTerms] = await Promise.all([
        apiClient.getTaxonomies(),
        apiClient.getTaxonomyTerms(props.taxonomySlug),
      ]);
      setTaxonomy(allTaxonomies.find((item) => item.slug === props.taxonomySlug) ?? null);
      setTerms(taxonomyTerms);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  onMount(load);

  const createTerm = async (event: Event): Promise<void> => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiClient.createTaxonomyTerm(props.taxonomySlug, {
        name: name(),
        slug: slug() || undefined,
        description: description() || undefined,
      });
      setName('');
      setSlug('');
      setDescription('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const removeTerm = async (term: TaxonomyTerm): Promise<void> => {
    if (!term.id || !confirm(t('content.taxonomy.confirmDelete', { name: term.name }))) return;
    try {
      await apiClient.deleteTaxonomyTerm(props.taxonomySlug, term.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div class="terms-panel">
      <Show when={error()}><div class="notice notice--error">{error()}</div></Show>
      <Show when={!taxonomy() && props.taxonomySlug}>
        <div class="notice notice--error">{t('content.taxonomy.notFound')}</div>
      </Show>
      <Show when={taxonomy()}>
        <form class="card term-form" onSubmit={createTerm}>
          <h3>{t('content.taxonomy.addTerm')}</h3>
          <label>
            {t('content.taxonomy.name')}
            <input class="input" required value={name()} onInput={(event) => setName(event.currentTarget.value)} />
          </label>
          <label>
            {t('content.taxonomy.slug')}
            <input class="input" value={slug()} onInput={(event) => setSlug(event.currentTarget.value)} />
          </label>
          <label>
            {t('content.taxonomy.description')}
            <textarea class="input" rows={3} value={description()} onInput={(event) => setDescription(event.currentTarget.value)} />
          </label>
          <button class="btn btn-primary" type="submit" disabled={saving()}>{t('content.taxonomy.add')}</button>
        </form>

        <div class="card">
          <div class="card-header">
            <div>
              <h3>{taxonomy()!.name}</h3>
              <p class="muted">{props.contentType ? `${t('content.taxonomy.attachedTo')}: ${props.contentType}` : t('content.taxonomy.descriptionHint')}</p>
            </div>
            <span class="badge">{terms().length}</span>
          </div>
          <Show when={terms().length > 0} fallback={<p class="muted">{t('content.taxonomy.empty')}</p>}>
            <table class="table">
              <thead><tr><th>{t('content.taxonomy.name')}</th><th>{t('content.taxonomy.slug')}</th><th /></tr></thead>
              <tbody>
                <For each={terms()}>
                  {(term) => <tr><td>{term.name}</td><td>{term.slug}</td><td><button class="btn btn-danger btn-sm" type="button" onClick={() => void removeTerm(term)}>{t('content.taxonomy.delete')}</button></td></tr>}
                </For>
              </tbody>
            </table>
          </Show>
        </div>
      </Show>
    </div>
  );
}
