import { For, Show, createSignal, onMount } from 'solid-js';
import {
  apiClient,
  type ContentType,
  type FieldCategoryInfo,
  type FieldGroup,
  type FieldTypeInfo,
  type Taxonomy,
} from '../../lib/api';
import { useTranslation } from '../../i18n';
import { Tabs } from './primitives/Tabs';
import { FieldListEditor } from './FieldListEditor';
import { LocationRulesEditor } from './LocationRulesEditor';
import {
  collectFieldOptions,
  emptyLocationRule,
  groupKeyFromTitle,
  normalizeLocationRules,
  toEditableField,
  toPayloadField,
  type EditableField,
  type FieldGroupDraft,
} from './model';

type TFn = (key: string) => string;

interface FieldGroupEditorProps {
  groupId: string;
}

const HIDE_ON_SCREEN = [
  'the_content', 'excerpt', 'featured_image', 'custom_fields', 'comments', 'revisions',
  'slug', 'author', 'format', 'page_attributes', 'categories', 'tags',
];

function newDraft(contentType?: string): FieldGroupDraft {
  return {
    title: '',
    position: 'normal',
    displayStyle: 'standard',
    active: true,
    locationRules: [[emptyLocationRule(contentType ?? '')]],
    fields: [],
    metadata: { labelPlacement: 'top', instructionPlacement: 'below', hideOnScreen: [] },
  };
}

/**
 * Field-group edit screen. Two sections: "Fields" (the sortable field
 * list) and "Settings" (Location Rules · Presentation · Group Settings tabs).
 */
export function FieldGroupEditor(props: FieldGroupEditorProps) {
  const { t } = useTranslation();
  const isNew = props.groupId === 'new';

  const [draft, setDraft] = createSignal<FieldGroupDraft | null>(null);
  const [contentTypes, setContentTypes] = createSignal<ContentType[]>([]);
  const [taxonomies, setTaxonomies] = createSignal<Taxonomy[]>([]);
  const [fieldTypes, setFieldTypes] = createSignal<FieldTypeInfo[]>([]);
  const [categories, setCategories] = createSignal<FieldCategoryInfo[]>([]);
  const [expandedId, setExpandedId] = createSignal<string | null>(null);
  const [settingsTab, setSettingsTab] = createSignal('location_rules');
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal('');

  onMount(async () => {
    try {
      const [types, taxList, catalog] = await Promise.all([
        apiClient.getContentTypes(),
        apiClient.getTaxonomies(),
        apiClient.getFieldTypes(),
      ]);
      setContentTypes(types);
      setTaxonomies(taxList);
      setFieldTypes(catalog.types);
      setCategories(catalog.categories);

      if (isNew) {
        setDraft(newDraft(types[0]?.slug));
      } else {
        const group: FieldGroup = await apiClient.getFieldGroup(props.groupId);
        setDraft({
          id: group.id,
          key: group.key,
          title: group.title,
          position: group.position ?? 'normal',
          displayStyle: group.displayStyle ?? 'standard',
          active: group.active !== false,
          locationRules: normalizeLocationRules(group.locationRules, types[0]?.slug),
          fields: (group.fields ?? []).map(toEditableField),
          metadata: { labelPlacement: 'top', instructionPlacement: 'below', hideOnScreen: [], ...((group.metadata ?? {}) as FieldGroupDraft['metadata']) },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  });

  const update = (patch: Partial<FieldGroupDraft>): void => {
    const current = draft();
    if (current) setDraft({ ...current, ...patch });
  };
  const updateMetadata = (patch: Partial<FieldGroupDraft['metadata']>): void => {
    const current = draft();
    if (current) setDraft({ ...current, metadata: { ...current.metadata, ...patch } });
  };
  const conditionFields = () => (draft() ? collectFieldOptions(draft()!.fields) : []);

  const goBack = (): void => { window.location.href = '/settings/custom-fields'; };

  const save = async (event: Event): Promise<void> => {
    event.preventDefault();
    const current = draft();
    if (!current) return;
    if (!current.title.trim()) { setError(t('settings.customFields.validation.titleRequired')); return; }
    if (current.locationRules.some((group) => group.some((rule) => !rule.value.trim()))) {
      setError(t('settings.customFields.location.required')); return;
    }
    setSaving(true); setError('');
    try {
      const payload = {
        title: current.title.trim(),
        key: current.key ?? groupKeyFromTitle(current.title),
        locationRules: current.locationRules,
        position: current.position,
        displayStyle: current.displayStyle,
        active: current.active,
        metadata: current.metadata,
        fields: current.fields.map((field, index) => toPayloadField(field, index)),
      };
      if (current.id) await apiClient.updateFieldGroup(current.id, payload);
      else await apiClient.createFieldGroup(payload);
      goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const setFields = (fields: EditableField[]): void => update({ fields });

  return (
    <div class="fb-editor">
      <Show when={error()}><div class="notice notice--error">{error()}</div></Show>

      <Show when={!loading()} fallback={<p class="muted">{t('settings.customFields.loading')}</p>}>
        <Show when={draft()}>
          <form class="fb-editor__form" onSubmit={save}>
            <div class="fb-editor__header">
              <div>
                <button type="button" class="fb-back-link" onClick={goBack}>← {t('settings.customFields.form.backToGroups')}</button>
                <span class="fb-eyebrow">{isNew ? t('settings.customFields.form.createTitle') : t('settings.customFields.form.editTitle')}</span>
                <h2>{draft()!.title || t('settings.customFields.form.titlePlaceholder')}</h2>
              </div>
              <div class="editor-actions">
                <button type="button" class="btn btn-secondary" onClick={goBack}>{t('settings.customFields.form.cancel')}</button>
                <button type="submit" class="btn btn-primary" disabled={saving()}>{saving() ? t('common.loading') : t('settings.customFields.form.save')}</button>
              </div>
            </div>

            {/* Identity */}
            <section class="card fb-panel">
              <div class="fb-panel__body fb-identity">
                <label class="fb-setting fb-setting--wide">
                  <span class="fb-setting__label">{t('settings.customFields.form.title')}</span>
                  <input class="input fb-group-title" required value={draft()!.title} placeholder={t('settings.customFields.form.titlePlaceholder')} onInput={(e) => update({ title: e.currentTarget.value })} />
                </label>
                <Show when={draft()!.key}><span class="fb-identity__key"><code>{draft()!.key}</code></span></Show>
              </div>
            </section>

            {/* Fields */}
            <section class="card fb-panel">
              <div class="fb-panel__header">
                <div>
                  <h3>{t('settings.customFields.form.fieldsTitle')}</h3>
                  <p class="muted">{t('settings.customFields.form.fieldsDescription')}</p>
                </div>
              </div>
              <div class="fb-panel__body">
                <FieldListEditor
                  fields={draft()!.fields}
                  types={fieldTypes()}
                  categories={categories()}
                  t={t}
                  listId="root"
                  depth={0}
                  expandedId={expandedId}
                  setExpandedId={setExpandedId}
                  conditionFields={conditionFields()}
                  onChange={setFields}
                />
              </div>
            </section>

            {/* Settings */}
            <section class="card fb-panel">
              <div class="fb-panel__header"><h3>{t('settings.customFields.form.settingsTitle')}</h3></div>
              <div class="fb-panel__body">
                <Tabs
                  ariaLabel={t('settings.customFields.form.settingsTitle')}
                  active={settingsTab()}
                  onChange={setSettingsTab}
                  tabs={[
                    { id: 'location_rules', label: t('settings.customFields.tabs.locationRules') },
                    { id: 'presentation', label: t('settings.customFields.tabs.presentation') },
                    { id: 'group_settings', label: t('settings.customFields.tabs.groupSettings') },
                  ]}
                >
                  <Show when={settingsTab() === 'location_rules'}>
                    <LocationRulesEditor
                      rules={draft()!.locationRules}
                      contentTypes={contentTypes()}
                      taxonomies={taxonomies()}
                      t={t}
                      onChange={(locationRules) => update({ locationRules })}
                    />
                  </Show>

                  <Show when={settingsTab() === 'presentation'}>
                    <div class="fb-settings-grid">
                      <GroupSelect label={t('settings.customFields.form.displayStyle')} value={draft()!.displayStyle} onChange={(v) => update({ displayStyle: v as FieldGroupDraft['displayStyle'] })} options={[
                        { value: 'standard', label: t('settings.customFields.form.displayStyles.standard') },
                        { value: 'seamless', label: t('settings.customFields.form.displayStyles.seamless') },
                        { value: 'grouped', label: t('settings.customFields.form.displayStyles.grouped') },
                      ]} />
                      <GroupSelect label={t('settings.customFields.form.position')} value={draft()!.position} onChange={(v) => update({ position: v as FieldGroupDraft['position'] })} options={[
                        { value: 'normal', label: t('settings.customFields.form.positions.normal') },
                        { value: 'side', label: t('settings.customFields.form.positions.side') },
                        { value: 'after_title', label: t('settings.customFields.form.positions.after_title') },
                      ]} />
                      <GroupSelect label={t('settings.customFields.form.labelPlacement')} value={draft()!.metadata.labelPlacement ?? 'top'} onChange={(v) => updateMetadata({ labelPlacement: v as 'top' | 'left' })} options={[
                        { value: 'top', label: t('settings.customFields.fieldSettings.top') },
                        { value: 'left', label: t('settings.customFields.fieldSettings.left') },
                      ]} />
                      <GroupSelect label={t('settings.customFields.form.instructionPlacement')} value={draft()!.metadata.instructionPlacement ?? 'below'} onChange={(v) => updateMetadata({ instructionPlacement: v as 'above' | 'below' })} options={[
                        { value: 'below', label: t('settings.customFields.fieldSettings.below') },
                        { value: 'above', label: t('settings.customFields.fieldSettings.above') },
                      ]} />
                      <label class="fb-setting"><span class="fb-setting__label">{t('settings.customFields.form.menuOrder')}</span>
                        <input class="input" type="number" value={draft()!.metadata.menuOrder ?? 0} onInput={(e) => updateMetadata({ menuOrder: Number(e.currentTarget.value) || 0 })} />
                      </label>
                      <div class="fb-setting fb-setting--wide">
                        <span class="fb-setting__label">{t('settings.customFields.form.hideOnScreen')}</span>
                        <div class="fb-checkbox-grid">
                          <For each={HIDE_ON_SCREEN}>{(item) => (
                            <label class="fb-checkbox"><input type="checkbox"
                              checked={(draft()!.metadata.hideOnScreen ?? []).includes(item)}
                              onChange={(e) => {
                                const set = new Set(draft()!.metadata.hideOnScreen ?? []);
                                if (e.currentTarget.checked) set.add(item); else set.delete(item);
                                updateMetadata({ hideOnScreen: [...set] });
                              }} /> <span>{item}</span></label>
                          )}</For>
                        </div>
                      </div>
                    </div>
                  </Show>

                  <Show when={settingsTab() === 'group_settings'}>
                    <div class="fb-settings-grid">
                      <label class="fb-setting fb-setting--wide"><span class="fb-setting__label">{t('settings.customFields.form.description')}</span>
                        <textarea class="input" rows={3} value={draft()!.metadata.description ?? ''} onInput={(e) => updateMetadata({ description: e.currentTarget.value })} />
                      </label>
                      <label class="fb-setting fb-setting--wide"><span class="fb-setting__label">{t('settings.customFields.form.displayTitle')}</span>
                        <input class="input" value={draft()!.metadata.displayTitle ?? ''} placeholder={draft()!.title} onInput={(e) => updateMetadata({ displayTitle: e.currentTarget.value })} />
                      </label>
                      <label class="fb-setting fb-setting--inline fb-setting--wide">
                        <input type="checkbox" checked={draft()!.active} onChange={(e) => update({ active: e.currentTarget.checked })} />
                        <span class="fb-setting__label">{t('settings.customFields.form.active')}</span>
                      </label>
                    </div>
                  </Show>
                </Tabs>
              </div>
            </section>

            <div class="editor-actions fb-editor__footer">
              <button type="submit" class="btn btn-primary" disabled={saving()}>{saving() ? t('common.loading') : t('settings.customFields.form.save')}</button>
            </div>
          </form>
        </Show>
      </Show>
    </div>
  );
}

function GroupSelect(props: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <label class="fb-setting">
      <span class="fb-setting__label">{props.label}</span>
      <select class="input" value={props.value} onChange={(e) => props.onChange(e.currentTarget.value)}>
        <For each={props.options}>{(opt) => <option value={opt.value}>{opt.label}</option>}</For>
      </select>
    </label>
  );
}
