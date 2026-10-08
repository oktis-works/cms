import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { apiClient, type ContentType, type FieldDefinition, type FieldGroup, type FieldTypeInfo, type FieldCategoryInfo, type LocationRule, type Taxonomy } from '../../../lib/api';
import { FieldTypePicker } from '../../content/FieldTypePicker';
import { useTranslation } from '../../../i18n';

const STANDARD_FIELD_KEYS = [
  'title',
  'slug',
  'content',
  'excerpt',
  'featured_image',
  'seo_title',
  'seo_description',
  'status',
  'author',
] as const;

type EditableField = FieldDefinition & {
  config: Record<string, unknown>;
  required: boolean;
};

interface FieldGroupDraft {
  id?: string;
  title: string;
  position: 'normal' | 'side' | 'acf_after_title';
  displayStyle: 'standard' | 'seamless' | 'grouped';
  active: boolean;
  locationRules: LocationRule[][];
  fields: EditableField[];
}

const LOCATION_PARAMS: LocationRule['param'][] = [
  'content_type',
  'content_slug',
  'taxonomy',
  'term',
  'user_role',
  'page_template',
  'post_status',
];

const emptyLocationRule = (contentType = ''): LocationRule => ({
  param: 'content_type',
  operator: 'eq',
  value: contentType,
});

const emptyField = (index: number, label: string): EditableField => ({
  type: 'text',
  name: `field_${index + 1}`,
  label,
  required: false,
  config: {},
});

const cloneField = (field: FieldDefinition): EditableField => ({
  ...field,
  required: Boolean(field.required),
  config: { ...(field.config ?? {}) },
  subFields: field.subFields?.map(cloneField),
  layouts: field.layouts?.map((layout) => ({
    ...layout,
    subFields: layout.subFields.map(cloneField),
  })),
});

function normalizeLocationRules(value: unknown, fallbackContentType = ''): LocationRule[][] {
  if (Array.isArray(value)) {
    const groups = value
      .filter((group): group is unknown[] => Array.isArray(group))
      .map((group) => group.filter((rule): rule is LocationRule => {
        if (!rule || typeof rule !== 'object') return false;
        const candidate = rule as Record<string, unknown>;
        return typeof candidate['param'] === 'string' && typeof candidate['value'] === 'string';
      }).map((rule): LocationRule => ({
        param: rule.param,
        operator: rule.operator === 'neq' ? 'neq' : 'eq',
        value: rule.value,
      })));
    if (groups.length > 0) return groups;
  }

  // Compatibilidade visual com o formato simplificado das migrations antigas.
  if (value && typeof value === 'object') {
    const shorthand = value as Record<string, unknown>;
    const rules = Object.entries(shorthand).flatMap(([param, values]) =>
      (Array.isArray(values) ? values : [values]).map((entry) => ({
        param: param as LocationRule['param'],
        operator: 'eq' as const,
        value: String(entry ?? ''),
      }))
    );
    if (rules.length > 0) return [rules];
  }

  return [[emptyLocationRule(fallbackContentType)]];
}

export function CustomFieldsManager() {
  const { t } = useTranslation();
  const [contentTypes, setContentTypes] = createSignal<ContentType[]>([]);
  const [taxonomies, setTaxonomies] = createSignal<Taxonomy[]>([]);
  const [groups, setGroups] = createSignal<FieldGroup[]>([]);
  const [fieldTypes, setFieldTypes] = createSignal<FieldTypeInfo[]>([]);
  const [categories, setCategories] = createSignal<FieldCategoryInfo[]>([]);
  const [selectedType, setSelectedType] = createSignal('');
  const [draft, setDraft] = createSignal<FieldGroupDraft | null>(null);
  const [draggedIndex, setDraggedIndex] = createSignal<number | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal('');
  const [notice, setNotice] = createSignal('');

  const selectedContentType = createMemo(() => contentTypes().find((type) => type.slug === selectedType()));
  const coreGroup = createMemo(() => groups().find((group) => group.key === `core-fields-${selectedType()}`));
  const groupContentTypes = (group: FieldGroup): string[] => [...new Set(
    (group.locationRules ?? [])
      .flat()
      .filter((rule) => rule.param === 'content_type' && rule.operator === 'eq' && rule.value)
      .map((rule) => rule.value)
  )];
  const customGroups = createMemo(() => groups().filter((group) => {
    if (group.key.startsWith('core-fields-')) return false;
    const targets = groupContentTypes(group);
    return targets.length === 0 || targets.includes(selectedType());
  }));

  const standardFields = createMemo(() => STANDARD_FIELD_KEYS.map((key) => {
    const definition = coreGroup()?.fields.find((field) => field.coreFieldKey === key || field.name === key);
    return {
      key,
      label: t(`settings.customFields.standard.fields.${key}`),
      type: definition?.type ?? 'text',
      locked: key === 'title' || key === 'slug' || Boolean(definition?.isLocked),
    };
  }));

  const enabledStandardFields = createMemo(() => {
    const configured = selectedContentType()?.defaultFields;
    return new Set(configured?.length ? configured : STANDARD_FIELD_KEYS);
  });

  const load = async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const [types, taxonomyList, catalog, summaries] = await Promise.all([
        apiClient.getContentTypes(),
        apiClient.getTaxonomies(),
        apiClient.getFieldTypes(),
        apiClient.getFieldGroups(),
      ]);
      const details = await Promise.all(summaries.map((summary) => apiClient.getFieldGroup(summary.id)));
      setContentTypes(types);
      setTaxonomies(taxonomyList);
      setFieldTypes(catalog.types);
      setCategories(catalog.categories);
      setGroups(details);
      if (!selectedType() && types[0]) setSelectedType(types[0].slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.customFields.loadError'));
    } finally {
      setLoading(false);
    }
  };

  onMount(load);

  const startNew = (): void => {
    setNotice('');
    setError('');
    setDraft({
      title: '',
      position: 'normal',
      displayStyle: 'standard',
      active: true,
      locationRules: [[emptyLocationRule(selectedType())]],
      fields: [emptyField(0, t('settings.customFields.form.newFieldDefault'))],
    });
  };

  const editGroup = (group: FieldGroup): void => {
    setNotice('');
    setError('');
    setDraft({
      id: group.id,
      title: group.title,
      position: group.position ?? 'normal',
      displayStyle: group.displayStyle ?? 'standard',
      active: group.active !== false,
      locationRules: normalizeLocationRules(group.locationRules, selectedType()),
      fields: group.fields.map(cloneField),
    });
  };

  const updateDraft = (patch: Partial<FieldGroupDraft>): void => {
    setDraft((current) => current ? { ...current, ...patch } : current);
  };

  const updateField = (index: number, patch: Partial<EditableField>): void => {
    setDraft((current) => current ? {
      ...current,
      fields: current.fields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field),
    } : current);
  };

  const updateLocationRule = (groupIndex: number, ruleIndex: number, patch: Partial<LocationRule>): void => {
    setDraft((current) => current ? {
      ...current,
      locationRules: current.locationRules.map((group, currentGroupIndex) => currentGroupIndex === groupIndex
        ? group.map((rule, currentRuleIndex) => currentRuleIndex === ruleIndex ? { ...rule, ...patch } : rule)
        : group),
    } : current);
  };

  const addLocationRule = (groupIndex: number): void => {
    setDraft((current) => current ? {
      ...current,
      locationRules: current.locationRules.map((group, index) => index === groupIndex
        ? [...group, emptyLocationRule(selectedType())]
        : group),
    } : current);
  };

  const addLocationRuleGroup = (): void => {
    setDraft((current) => current ? {
      ...current,
      locationRules: [...current.locationRules, [emptyLocationRule(selectedType())]],
    } : current);
  };

  const removeLocationRule = (groupIndex: number, ruleIndex: number): void => {
    setDraft((current) => {
      if (!current) return current;
      const groups = current.locationRules
        .map((group, index) => index === groupIndex ? group.filter((_, ruleIndexInGroup) => ruleIndexInGroup !== ruleIndex) : group)
        .filter((group) => group.length > 0);
      return { ...current, locationRules: groups.length > 0 ? groups : [[emptyLocationRule(selectedType())]] };
    });
  };

  const locationParamLabel = (param: LocationRule['param']): string => t(`settings.customFields.location.params.${param}`);
  const locationOperatorLabel = (operator: LocationRule['operator']): string => operator === 'eq'
    ? t('settings.customFields.location.operators.eq')
    : t('settings.customFields.location.operators.neq');

  const locationValueOptions = (param: LocationRule['param']): Array<{ value: string; label: string }> => {
    if (param === 'content_type') return contentTypes().map((type) => ({ value: type.slug, label: `${type.pluralLabel} (${type.slug})` }));
    if (param === 'taxonomy') return taxonomies().map((taxonomy) => ({ value: taxonomy.slug, label: `${taxonomy.name} (${taxonomy.slug})` }));
    if (param === 'post_status') return ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'TRASHED'].map((status) => ({ value: status, label: status }));
    return [];
  };

  const addField = (): void => {
    setDraft((current) => current ? {
      ...current,
      fields: [...current.fields, emptyField(current.fields.length, t('settings.customFields.form.newFieldDefault'))],
    } : current);
  };

  const draftContentType = (rules: LocationRule[][]): string =>
    rules.flat().find((rule) => rule.param === 'content_type' && rule.operator === 'eq')?.value ?? selectedType();

  const updateDraftContentType = (contentType: string): void => {
    setDraft((current) => {
      if (!current) return current;
      const locationRules = current.locationRules.length > 0
        ? current.locationRules.map((group) => [...group])
        : [[emptyLocationRule(contentType)]];
      const firstGroup = locationRules[0] ?? [];
      const existingIndex = firstGroup.findIndex((rule) => rule.param === 'content_type');
      if (existingIndex >= 0) {
        firstGroup[existingIndex] = { ...firstGroup[existingIndex]!, operator: 'eq', value: contentType };
      } else {
        firstGroup.unshift(emptyLocationRule(contentType));
      }
      locationRules[0] = firstGroup;
      return { ...current, locationRules };
    });
  };

  const locationSummary = (group: FieldGroup): string => {
    const targets = groupContentTypes(group);
    if (targets.length === 0) return t('settings.customFields.groups.allContentTypes');
    return targets.map((slug) => contentTypes().find((type) => type.slug === slug)?.pluralLabel ?? slug).join(', ');
  };

  const removeField = (index: number): void => {
    setDraft((current) => current ? { ...current, fields: current.fields.filter((_, fieldIndex) => fieldIndex !== index) } : current);
  };

  const moveField = (from: number, to: number): void => {
    setDraft((current) => {
      if (!current || from === to || from < 0 || to < 0 || from >= current.fields.length || to >= current.fields.length) return current;
      const fields = [...current.fields];
      const [moved] = fields.splice(from, 1);
      if (!moved) return current;
      fields.splice(to, 0, moved);
      return { ...current, fields };
    });
  };

  const optionsText = (field: EditableField): string => {
    const options = field.config['options'];
    if (!Array.isArray(options)) return '';
    return options.map((option) => {
      if (option && typeof option === 'object') {
        const row = option as { value?: unknown; label?: unknown };
        return `${String(row.value ?? '')}|${String(row.label ?? row.value ?? '')}`;
      }
      return String(option);
    }).join('\n');
  };

  const updateOptions = (index: number, value: string): void => {
    const options = value.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const [rawOptionValue = '', ...labelParts] = line.split('|');
      const optionValue = rawOptionValue.trim();
      const label = labelParts.join('|').trim() || optionValue;
      return { value: optionValue, label };
    });
    const field = draft()?.fields[index];
    if (field) updateField(index, { config: { ...field.config, options } });
  };

  const saveGroup = async (event: Event): Promise<void> => {
    event.preventDefault();
    const current = draft();
    if (!current) return;

    if (current.locationRules.some((group) => group.some((rule) => !rule.value.trim()))) {
      setError(t('settings.customFields.location.required'));
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const fields = current.fields.map((field, index) => ({
        id: field.id,
        type: field.type,
        name: field.name.trim(),
        label: field.label.trim() || field.name.trim(),
        instructions: field.instructions?.trim() || undefined,
        required: field.required,
        config: field.config,
        conditionalLogic: field.conditionalLogic,
        subFields: field.subFields,
        layouts: field.layouts,
        sortOrder: index,
      }));
      const payload = {
        title: current.title.trim(),
        locationRules: current.locationRules,
        position: current.position,
        displayStyle: current.displayStyle,
        active: current.active,
        fields,
      };

      if (current.id) {
        await apiClient.updateFieldGroup(current.id, payload);
      } else {
        await apiClient.createFieldGroup(payload);
      }
      setDraft(null);
      setNotice(t('settings.customFields.form.saved'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleStandardField = async (key: string): Promise<void> => {
    const type = selectedContentType();
    const field = standardFields().find((entry) => entry.key === key);
    if (!type || !field || field.locked) return;

    const next = new Set(enabledStandardFields());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    next.add('title');
    next.add('slug');

    try {
      const updated = await apiClient.updateContentType(type.slug, { defaultFields: [...next] });
      setContentTypes((current) => current.map((entry) => entry.slug === updated.slug ? updated : entry));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const deleteGroup = async (group: FieldGroup): Promise<void> => {
    if (!window.confirm(t('settings.customFields.actions.confirmDelete'))) return;
    try {
      await apiClient.deleteFieldGroup(group.id);
      setNotice(t('settings.customFields.form.deleted'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div class="custom-fields-manager">
      <Show when={error()}>
        <div class="notice notice--error">{error()}</div>
      </Show>
      <Show when={notice()}>
        <div class="notice">{notice()}</div>
      </Show>

      <Show when={!loading()} fallback={<p class="muted">{t('settings.customFields.loading')}</p>}>
        <div class="custom-fields-toolbar">
          <label>
            {t('settings.customFields.contentType')}
            <select class="input" value={selectedType()} onChange={(event) => setSelectedType(event.currentTarget.value)}>
              <For each={contentTypes()}>{(type) => <option value={type.slug}>{type.pluralLabel} ({type.slug})</option>}</For>
            </select>
          </label>
          <button type="button" class="btn btn-primary" onClick={startNew}>
            + {t('settings.customFields.groups.new')}
          </button>
        </div>

        <section class="card standard-fields-card">
          <div class="section-heading">
            <div>
              <h3>{t('settings.customFields.standard.title')}</h3>
              <p class="muted">{t('settings.customFields.standard.description')}</p>
            </div>
          </div>
          <div class="standard-fields-list">
            <For each={standardFields()}>
              {(field) => (
                <label class="standard-field-row" classList={{ 'is-locked': field.locked }}>
                  <span>
                    <strong>{field.label}</strong>
                    <small>{field.key} · {field.type}</small>
                  </span>
                  <span class="standard-field-control">
                    <Show when={field.locked} fallback={<input type="checkbox" checked={enabledStandardFields().has(field.key)} onChange={() => void toggleStandardField(field.key)} />}>
                      <span class="badge badge-secondary">{t('settings.customFields.standard.locked')}</span>
                    </Show>
                    <Show when={!field.locked}>
                      <span class="muted">{enabledStandardFields().has(field.key) ? t('settings.customFields.standard.enabled') : t('settings.customFields.groups.inactive')}</span>
                    </Show>
                  </span>
                </label>
              )}
            </For>
          </div>
        </section>

        <Show when={draft()}>
          {(current) => (
            <section class="card field-group-editor">
              <div class="section-heading">
                <h3>{current().id ? t('settings.customFields.form.editTitle') : t('settings.customFields.form.createTitle')}</h3>
                <button type="button" class="btn" onClick={() => setDraft(null)}>{t('settings.customFields.form.cancel')}</button>
              </div>
              <form onSubmit={saveGroup}>
                <div class="form-grid">
                  <label>
                    {t('settings.customFields.form.title')}
                    <input class="input" required value={current().title} placeholder={t('settings.customFields.form.titlePlaceholder')} onInput={(event) => updateDraft({ title: event.currentTarget.value })} />
                  </label>
                  <label>
                    {t('settings.customFields.form.position')}
                    <select class="input" value={current().position} onChange={(event) => updateDraft({ position: event.currentTarget.value as FieldGroupDraft['position'] })}>
                      <option value="normal">{t('settings.customFields.form.positions.normal')}</option>
                      <option value="side">{t('settings.customFields.form.positions.side')}</option>
                      <option value="acf_after_title">{t('settings.customFields.form.positions.acf_after_title')}</option>
                    </select>
                  </label>
                  <label>
                    {t('settings.customFields.form.displayStyle')}
                    <select class="input" value={current().displayStyle} onChange={(event) => updateDraft({ displayStyle: event.currentTarget.value as FieldGroupDraft['displayStyle'] })}>
                      <option value="standard">{t('settings.customFields.form.displayStyles.standard')}</option>
                      <option value="seamless">{t('settings.customFields.form.displayStyles.seamless')}</option>
                      <option value="grouped">{t('settings.customFields.form.displayStyles.grouped')}</option>
                    </select>
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" checked={current().active} onChange={(event) => updateDraft({ active: event.currentTarget.checked })} />
                    {t('settings.customFields.groups.active')}
                  </label>
                </div>

                <div class="acf-assignment">
                  <div>
                    <h4>{t('settings.customFields.form.assignTitle')}</h4>
                    <p class="muted">{t('settings.customFields.form.assignDescription')}</p>
                  </div>
                  <label>
                    {t('settings.customFields.form.contentType')}
                    <select class="input" value={draftContentType(current().locationRules)} onChange={(event) => updateDraftContentType(event.currentTarget.value)}>
                      <For each={contentTypes()}>{(type) => <option value={type.slug}>{type.pluralLabel} ({type.slug})</option>}</For>
                    </select>
                  </label>
                </div>

                <div class="location-rules-editor">
                  <div class="fields-editor-heading">
                    <div>
                      <h4>{t('settings.customFields.location.title')}</h4>
                      <p class="muted">{t('settings.customFields.location.description')}</p>
                    </div>
                    <button type="button" class="btn" onClick={addLocationRuleGroup}>+ {t('settings.customFields.location.addGroup')}</button>
                  </div>
                  <For each={current().locationRules}>
                    {(ruleGroup, groupIndex) => (
                      <div class="location-rule-group">
                        <Show when={groupIndex() > 0}>
                          <div class="rule-connector">{t('settings.customFields.location.or')}</div>
                        </Show>
                        <For each={ruleGroup}>
                          {(rule, ruleIndex) => (
                            <>
                              <Show when={ruleIndex() > 0}>
                                <div class="rule-connector">{t('settings.customFields.location.and')}</div>
                              </Show>
                              <div class="location-rule-row">
                                <select
                                  class="input"
                                  value={rule.param}
                                  aria-label={t('settings.customFields.location.parameter')}
                                  onChange={(event) => {
                                    const param = event.currentTarget.value as LocationRule['param'];
                                    const firstOption = locationValueOptions(param)[0]?.value ?? '';
                                    updateLocationRule(groupIndex(), ruleIndex(), { param, value: firstOption });
                                  }}
                                >
                                  <For each={LOCATION_PARAMS}>
                                    {(param) => <option value={param}>{locationParamLabel(param)}</option>}
                                  </For>
                                </select>
                                <select
                                  class="input"
                                  value={rule.operator}
                                  aria-label={t('settings.customFields.location.operator')}
                                  onChange={(event) => updateLocationRule(groupIndex(), ruleIndex(), { operator: event.currentTarget.value as LocationRule['operator'] })}
                                >
                                  <option value="eq">{locationOperatorLabel('eq')}</option>
                                  <option value="neq">{locationOperatorLabel('neq')}</option>
                                </select>
                                <Show when={locationValueOptions(rule.param).length > 0} fallback={
                                  <input class="input" required value={rule.value} placeholder={t('settings.customFields.location.valuePlaceholder')} onInput={(event) => updateLocationRule(groupIndex(), ruleIndex(), { value: event.currentTarget.value })} />
                                }>
                                  <select class="input" required value={rule.value} onChange={(event) => updateLocationRule(groupIndex(), ruleIndex(), { value: event.currentTarget.value })}>
                                    <option value="">{t('settings.customFields.location.chooseValue')}</option>
                                    <For each={locationValueOptions(rule.param)}>{(option) => <option value={option.value}>{option.label}</option>}</For>
                                  </select>
                                </Show>
                                <button type="button" class="btn btn-danger" onClick={() => removeLocationRule(groupIndex(), ruleIndex())}>{t('settings.customFields.location.remove')}</button>
                              </div>
                            </>
                          )}
                        </For>
                        <button type="button" class="btn rule-add" onClick={() => addLocationRule(groupIndex())}>+ {t('settings.customFields.location.addRule')}</button>
                      </div>
                    )}
                  </For>
                </div>

                <div class="fields-editor-heading">
                  <h4>{t('settings.customFields.form.field')}</h4>
                  <button type="button" class="btn" onClick={addField}>+ {t('settings.customFields.form.addField')}</button>
                </div>

                <div class="editable-fields-list">
                  <For each={current().fields}>
                    {(field, index) => (
                      <article
                        class="editable-field"
                        classList={{ 'is-dragging': draggedIndex() === index() }}
                        draggable="true"
                        onDragStart={(event) => {
                          setDraggedIndex(index());
                          event.dataTransfer?.setData('text/plain', String(index()));
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          const from = draggedIndex();
                          if (from !== null) moveField(from, index());
                          setDraggedIndex(null);
                        }}
                        onDragEnd={() => setDraggedIndex(null)}
                      >
                        <div class="editable-field__topline">
                          <span class="drag-handle" title={t('settings.customFields.form.dragHint')} aria-label={t('settings.customFields.form.dragHint')}>⠿</span>
                          <strong>{t('settings.customFields.form.field')} {index() + 1}</strong>
                          <span class="muted">{t('settings.customFields.form.dragHint')}</span>
                          <button type="button" class="btn btn-danger" onClick={() => removeField(index())}>{t('settings.customFields.form.removeField')}</button>
                        </div>
                        <div class="field-grid">
                          <label>
                            {t('settings.customFields.form.fieldLabel')}
                            <input class="input" required value={field.label} placeholder={t('settings.customFields.form.fieldLabelPlaceholder')} onInput={(event) => updateField(index(), { label: event.currentTarget.value })} />
                          </label>
                          <label>
                            {t('settings.customFields.form.fieldName')}
                            <input class="input" required pattern="[a-zA-Z0-9_-]+" value={field.name} placeholder={t('settings.customFields.form.fieldNamePlaceholder')} onInput={(event) => updateField(index(), { name: event.currentTarget.value })} />
                          </label>
                          <label>
                            {t('settings.customFields.form.fieldType')}
                            <FieldTypePicker categories={categories()} types={fieldTypes()} value={field.type} onChange={(type) => updateField(index(), { type })} />
                          </label>
                          <label class="checkbox-label field-required">
                            <input type="checkbox" checked={field.required} onChange={(event) => updateField(index(), { required: event.currentTarget.checked })} />
                            {t('settings.customFields.form.required')}
                          </label>
                        </div>
                        <label>
                          {t('settings.customFields.form.instructions')}
                          <input class="input" value={field.instructions ?? ''} placeholder={t('settings.customFields.form.instructionsPlaceholder')} onInput={(event) => updateField(index(), { instructions: event.currentTarget.value })} />
                        </label>
                        <Show when={['select', 'checkbox', 'radio'].includes(field.type)}>
                          <label>
                            {t('settings.customFields.form.options')}
                            <textarea class="input" rows={3} value={optionsText(field)} placeholder={t('settings.customFields.form.optionsHint')} onInput={(event) => updateOptions(index(), event.currentTarget.value)} />
                            <small class="muted">{t('settings.customFields.form.optionsHint')}</small>
                          </label>
                        </Show>
                      </article>
                    )}
                  </For>
                </div>

                <div class="editor-actions">
                  <button type="submit" class="btn btn-primary" disabled={saving()}>{saving() ? t('common.loading') : t('settings.customFields.form.save')}</button>
                </div>
              </form>
            </section>
          )}
        </Show>

        <section class="card groups-card">
          <div class="section-heading">
            <h3>{t('settings.customFields.groups.title')}</h3>
          </div>
          <Show when={customGroups().length > 0} fallback={<p class="muted">{t('settings.customFields.groups.empty')}</p>}>
            <div class="groups-list">
              <For each={customGroups()}>
                {(group) => (
                  <div class="group-row">
                    <div>
                      <strong>{group.title}</strong>
                      <small>{group.key} · {group.fields.length} {t('settings.customFields.groups.fields')}</small>
                      <small>{t('settings.customFields.groups.appliesTo')}: {locationSummary(group)}</small>
                    </div>
                    <div class="group-row__actions">
                      <span class="badge" classList={{ 'badge-success': group.active !== false, 'badge-secondary': group.active === false }}>
                        {group.active !== false ? t('settings.customFields.groups.active') : t('settings.customFields.groups.inactive')}
                      </span>
                      <button type="button" class="btn" onClick={() => editGroup(group)}>{t('settings.customFields.groups.edit')}</button>
                      <button type="button" class="btn btn-danger" onClick={() => void deleteGroup(group)}>{t('settings.customFields.actions.delete')}</button>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </section>
      </Show>
    </div>
  );
}
