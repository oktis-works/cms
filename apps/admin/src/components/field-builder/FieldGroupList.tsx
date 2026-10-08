import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { apiClient, type ContentType, type FieldGroupSummary } from '../../lib/api';
import { useTranslation } from '../../i18n';
import { FbIcon } from './primitives/FbIcon';

/**
 * Field-group list screen: an overview table (Title · Description · Key ·
 * Location · Fields · Active) with row actions (Edit, Duplicate, Activate,
 * Delete), a content-type filter, search, and an empty state.
 */
export function FieldGroupList() {
  const { t } = useTranslation();
  const [groups, setGroups] = createSignal<FieldGroupSummary[]>([]);
  const [contentTypes, setContentTypes] = createSignal<ContentType[]>([]);
  const [selectedType, setSelectedType] = createSignal('');
  const [search, setSearch] = createSignal('');
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal('');

  onMount(async () => {
    try {
      const [types, summaries] = await Promise.all([apiClient.getContentTypes(), apiClient.getFieldGroups()]);
      setContentTypes(types);
      setGroups(summaries);
      if (types[0]) setSelectedType(types[0].slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  });

  const groupTargets = (group: FieldGroupSummary): string[] =>
    [...new Set((group.locationRules ?? []).flat().filter((r) => r.param === 'content_type' && r.operator === 'eq' && r.value).map((r) => r.value))];

  const locationSummary = (group: FieldGroupSummary): string => {
    const targets = groupTargets(group);
    if (targets.length === 0) return t('settings.customFields.groups.allContentTypes');
    return targets.map((slug) => contentTypes().find((type) => type.slug === slug)?.pluralLabel ?? slug).join(', ');
  };

  const filtered = createMemo(() => {
    const q = search().trim().toLowerCase();
    return groups()
      .filter((group) => !group.key.startsWith('core-fields-'))
      .filter((group) => {
        const targets = groupTargets(group);
        const matchesType = !selectedType() || targets.length === 0 || targets.includes(selectedType());
        return matchesType && (!q || group.title.toLowerCase().includes(q) || group.key.toLowerCase().includes(q));
      });
  });

  const goEditor = (id: string): void => { window.location.href = `/settings/custom-fields/${id}`; };

  const duplicate = async (group: FieldGroupSummary): Promise<void> => {
    try {
      const detail = await apiClient.getFieldGroup(group.id);
      await apiClient.createFieldGroup({
        ...detail,
        id: undefined,
        key: `${detail.key}-copy-${Date.now().toString(36)}`,
        title: `${detail.title} ${t('settings.customFields.form.copySuffix')}`,
      });
      await reload();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  const toggleActive = async (group: FieldGroupSummary): Promise<void> => {
    try {
      const detail = await apiClient.getFieldGroup(group.id);
      await apiClient.updateFieldGroup(group.id, { ...detail, active: !group.active });
      await reload();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  const remove = async (group: FieldGroupSummary): Promise<void> => {
    if (!window.confirm(t('settings.customFields.actions.confirmDelete'))) return;
    try {
      await apiClient.deleteFieldGroup(group.id);
      await reload();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  const reload = async (): Promise<void> => {
    const summaries = await apiClient.getFieldGroups();
    setGroups(summaries);
  };

  // Import/Export
  const [importOpen, setImportOpen] = createSignal(false);
  const [importFile, setImportFile] = createSignal<File | null>(null);
  const [importLoading, setImportLoading] = createSignal(false);

  const exportGroup = async (group: FieldGroupSummary): Promise<void> => {
    try {
      const blob = await apiClient.exportFieldGroup(group.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${group.key}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  const handleImportFile = (e: Event): void => {
    const input = e.currentTarget as HTMLInputElement;
    if (input.files && input.files[0]) setImportFile(input.files[0]);
  };

  const doImport = async (): Promise<void> => {
    const file = importFile();
    if (!file) return;
    setImportLoading(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = await apiClient.importFieldGroups(data);
      // Show results
      const failures = result.results.filter((r) => !r.success);
      if (failures.length > 0) {
        setError(failures.map((f) => `${f.key}: ${f.error}`).join('; '));
      } else {
        setError(''); // clear
      }
      setImportOpen(false);
      setImportFile(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImportLoading(false);
    }
  };

  const A = (key: string): string => t(`settings.customFields.actions.${key}`);
  const G = (key: string): string => t(`settings.customFields.groups.${key}`);

  return (
    <div class="fb-list">
      <Show when={error()}><div class="notice notice--error">{error()}</div></Show>

      <div class="fb-list__header">
        <div>
          <span class="fb-eyebrow">{t('settings.customFields.listEyebrow')}</span>
          <h2>{G('title')}</h2>
          <p class="muted">{t('settings.customFields.description')}</p>
        </div>
        <div class="fb-list__header-actions">
          <label class="fb-import-btn">
            <input type="file" accept=".json" onChange={handleImportFile} hidden />
            <button type="button" class="btn btn-secondary" onClick={() => setImportOpen(true)}>
              <FbIcon name="upload" class="fb-btn-icon" /> {A('import')}
            </button>
          </label>
          <a class="btn btn-primary" href="/settings/custom-fields/new">+ {G('new')}</a>
        </div>
      </div>

      <Show when={!loading()} fallback={<p class="muted">{t('settings.customFields.loading')}</p>}>
        <div class="fb-list__toolbar">
          <label class="fb-list__filter">
            <span>{t('settings.customFields.contentType')}</span>
            <select class="input" value={selectedType()} onChange={(e) => setSelectedType(e.currentTarget.value)}>
              <option value="">{G('allContentTypes')}</option>
              <For each={contentTypes()}>{(type) => <option value={type.slug}>{type.pluralLabel} ({type.slug})</option>}</For>
            </select>
          </label>
          <input class="input fb-list__search" type="search" placeholder={G('search')} value={search()} onInput={(e) => setSearch(e.currentTarget.value)} />
        </div>

        <section class="card fb-groups-table">
          <Show when={filtered().length > 0} fallback={
            <div class="fb-empty-groups">
              <FbIcon name="columns-3" class="fb-empty-icon" />
              <h4>{G('empty')}</h4>
              <p class="muted">{G('emptyHint')}</p>
              <a class="btn btn-primary" href="/settings/custom-fields/new">{G('new')}</a>
            </div>
          }>
            <div class="fb-groups-table__head">
              <span>{G('groupName')}</span>
              <span>{t('settings.customFields.form.description')}</span>
              <span>{G('appliesTo')}</span>
              <span>{G('fields')}</span>
              <span>{G('status')}</span>
              <span />
            </div>
            <For each={filtered()}>
              {(group) => (
                <div class="fb-groups-table__row" onClick={() => goEditor(group.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') goEditor(group.id); }}>
                  <div class="fb-groups-table__title">
                    <strong>{group.title}</strong>
                    <code>{group.key}</code>
                  </div>
                  <span class="fb-groups-table__desc muted">{String(group.metadata?.['description'] ?? '—')}</span>
                  <span class="fb-groups-table__location">{locationSummary(group)}</span>
                  <span class="fb-groups-table__count">{group.fieldCount}</span>
                  <span>
                    <span class="badge" classList={{ 'badge-success': group.active, 'badge-secondary': !group.active }}>
                      {group.active ? G('active') : G('inactive')}
                    </span>
                  </span>
                  <div class="fb-groups-table__actions" onClick={(e) => e.stopPropagation()}>
                    <button type="button" class="fb-row-action" onClick={() => goEditor(group.id)}>{A('edit')}</button>
                    <button type="button" class="fb-row-action" onClick={() => void exportGroup(group)}>{A('export')}</button>
                    <button type="button" class="fb-row-action" onClick={() => void duplicate(group)}>{A('duplicate')}</button>
                    <button type="button" class="fb-row-action" onClick={() => void toggleActive(group)}>{group.active ? A('deactivate') : A('activate')}</button>
                    <button type="button" class="fb-row-action is-danger" onClick={() => void remove(group)}>{A('delete')}</button>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </section>
      </Show>

      {/* Import Modal */}
      <Show when={importOpen()}>
        <div class="fb-modal-backdrop" onClick={() => { setImportOpen(false); setImportFile(null); }}>
          <div class="fb-modal" onClick={(e) => e.stopPropagation()}>
            <div class="fb-modal__header">
              <h3>{A('import')}</h3>
              <button type="button" class="fb-modal__close" onClick={() => { setImportOpen(false); setImportFile(null); }} aria-label={t('common.close')}>
                <FbIcon name="x" />
              </button>
            </div>
            <div class="fb-modal__body">
              <p class="muted">{t('settings.customFields.import.description')}</p>
              <label class="fb-import-dropzone" onClick={() => document.getElementById('import-file-input')?.click()}>
                <input id="import-file-input" type="file" accept=".json" onChange={handleImportFile} hidden />
                <FbIcon name="upload" class="fb-dropzone-icon" />
                <span>{importFile() ? importFile()!.name : t('settings.customFields.import.dropzone')}</span>
              </label>
              <Show when={importFile()}>
                <p class="muted fb-import-hint">{t('settings.customFields.import.hint')}</p>
              </Show>
            </div>
            <div class="fb-modal__footer">
              <button type="button" class="btn btn-secondary" onClick={() => { setImportOpen(false); setImportFile(null); }}>{t('common.cancel')}</button>
              <button type="button" class="btn btn-primary" onClick={doImport} disabled={!importFile() || importLoading()}>
                {importLoading() ? t('common.loading') : A('import')}
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
