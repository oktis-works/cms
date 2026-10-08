import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { apiClient, type ContentType, type FieldDefinition, type FieldGroup, type FieldTypeInfo, type FieldCategoryInfo, type LocationRule, type Taxonomy } from '../../../lib/api';
import { FieldTypePicker } from '../../content/FieldTypePicker';
import { useTranslation } from '../../../i18n';

const STANDARD_FIELD_KEYS = ['title', 'slug', 'content', 'excerpt', 'featured_image', 'seo_title', 'seo_description', 'status', 'author'] as const;
const LOCATION_PARAMS: LocationRule['param'][] = ['content_type', 'content_slug', 'taxonomy', 'term', 'user_role', 'page_template', 'post_status'];
const CONTAINER_TYPES = new Set(['group', 'repeater']);
const CHOICE_TYPES = new Set(['select', 'checkbox', 'radio']);
const MEDIA_TYPES = new Set(['image', 'file', 'gallery']);
const RELATION_TYPES = new Set(['post_object', 'relationship', 'page_link', 'taxonomy', 'user']);

type LabelPlacement = 'top' | 'left';
type InstructionPlacement = 'above' | 'below';
type EditableLayout = {
  clientId: string;
  name: string;
  label: string;
  display?: 'block' | 'table' | 'row' | string;
  min?: number;
  max?: number;
  subFields: EditableField[];
};
type EditableField = Omit<FieldDefinition, 'subFields' | 'layouts'> & {
  clientId: string;
  config: Record<string, unknown>;
  required: boolean;
  subFields: EditableField[];
  layouts: EditableLayout[];
};

interface FieldGroupMetadata {
  description?: string;
  labelPlacement?: LabelPlacement;
  instructionPlacement?: InstructionPlacement;
  menuOrder?: number;
  hideOnScreen?: string[];
}

interface FieldGroupDraft {
  id?: string;
  title: string;
  position: 'normal' | 'side' | 'acf_after_title';
  displayStyle: 'standard' | 'seamless' | 'grouped';
  active: boolean;
  locationRules: LocationRule[][];
  fields: EditableField[];
  metadata: FieldGroupMetadata;
}

interface FieldOption { value: string; label: string; }
interface ConditionalRule { field: string; operator: string; value?: string; }
interface ConditionalLogic { match: 'ALL' | 'ANY'; groups: Array<{ match: 'ALL' | 'ANY'; rules: ConditionalRule[] }>; }

let clientSequence = 0;
function clientId(prefix: string): string {
  clientSequence += 1;
  const uuid = typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}_${uuid}_${clientSequence}`;
}

const emptyLocationRule = (contentType = ''): LocationRule => ({ param: 'content_type', operator: 'eq', value: contentType });

function emptyField(index: number, label: string, type = 'text'): EditableField {
  return { clientId: clientId('field'), type, name: `field_${index + 1}`, label, required: false, config: {}, subFields: [], layouts: [] };
}

function cloneField(field: FieldDefinition): EditableField {
  return {
    ...field,
    clientId: clientId('field'),
    required: Boolean(field.required),
    config: { ...(field.config ?? {}) },
    subFields: (field.subFields ?? []).map(cloneField),
    layouts: (field.layouts ?? []).map((layout) => ({ ...layout, clientId: clientId('layout'), subFields: layout.subFields.map(cloneField) })),
  };
}

function normalizeLocationRules(value: unknown, fallbackContentType = ''): LocationRule[][] {
  if (Array.isArray(value)) {
    const groups = value.filter(Array.isArray).map((group) => (group as unknown[]).filter((rule): rule is LocationRule => {
      if (!rule || typeof rule !== 'object') return false;
      const candidate = rule as Record<string, unknown>;
      return typeof candidate['param'] === 'string' && typeof candidate['value'] === 'string';
    }).map((rule): LocationRule => ({ param: rule.param, operator: rule.operator === 'neq' ? 'neq' : 'eq', value: rule.value })));
    if (groups.length > 0) return groups;
  }
  if (value && typeof value === 'object') {
    const shorthand = value as Record<string, unknown>;
    const rules = Object.entries(shorthand).flatMap(([param, values]) => (Array.isArray(values) ? values : [values]).map((entry) => ({ param: param as LocationRule['param'], operator: 'eq' as const, value: String(entry ?? '') })));
    if (rules.length > 0) return [rules];
  }
  return [[emptyLocationRule(fallbackContentType)]];
}

function updateFieldInList(fields: EditableField[], id: string, patch: Partial<EditableField>): EditableField[] {
  return fields.map((field) => {
    if (field.clientId === id) return { ...field, ...patch };
    return {
      ...field,
      subFields: updateFieldInList(field.subFields, id, patch),
      layouts: field.layouts.map((layout) => ({ ...layout, subFields: updateFieldInList(layout.subFields, id, patch) })),
    };
  });
}

function toPayloadField(field: EditableField, sortOrder: number): Record<string, unknown> {
  return {
    id: field.id,
    type: field.type,
    name: field.name.trim(),
    label: field.label.trim() || field.name.trim(),
    instructions: field.instructions?.trim() || undefined,
    required: field.required,
    config: field.config,
    conditionalLogic: field.conditionalLogic,
    sortOrder,
    subFields: field.subFields.map((sub, index) => toPayloadField(sub, index)),
    layouts: field.layouts.map((layout, index) => ({
      name: layout.name.trim(),
      label: layout.label.trim() || layout.name.trim(),
      display: layout.display ?? 'block',
      min: layout.min,
      max: layout.max,
      sortOrder: index,
      subFields: layout.subFields.map((sub, subIndex) => toPayloadField(sub, subIndex)),
    })),
  };
}

function readConditional(value: unknown): ConditionalLogic {
  if (!value || typeof value !== 'object') return { match: 'ANY', groups: [{ match: 'ALL', rules: [] }] };
  const raw = value as Record<string, unknown>;
  const groups = Array.isArray(raw['groups']) ? raw['groups'].filter(Boolean).map((group) => {
    const item = group as Record<string, unknown>;
    const rules = Array.isArray(item['rules']) ? item['rules'].filter(Boolean).map((rule) => {
      const entry = rule as Record<string, unknown>;
      return { field: String(entry['field'] ?? ''), operator: String(entry['operator'] ?? 'eq'), value: entry['value'] === undefined ? undefined : String(entry['value']) };
    }) : [];
    return { match: item['match'] === 'ANY' ? 'ANY' as const : 'ALL' as const, rules };
  }) : [];
  return { match: raw['match'] === 'ALL' ? 'ALL' : 'ANY', groups: groups.length > 0 ? groups : [{ match: 'ALL', rules: [] }] };
}

function fieldTypeLabel(field: EditableField, types: FieldTypeInfo[]): string {
  return types.find((type) => type.type === field.type)?.label ?? field.type;
}

function textChoices(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.map((choice) => {
    if (!choice || typeof choice !== 'object') return String(choice);
    const row = choice as Record<string, unknown>;
    return `${String(row['value'] ?? '')}|${String(row['label'] ?? row['value'] ?? '')}`;
  }).join('\n');
}

function parseChoices(value: string): Array<{ value: string; label: string }> {
  return value.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const [rawValue = '', ...labelParts] = line.split('|');
    const choiceValue = rawValue.trim();
    return { value: choiceValue, label: labelParts.join('|').trim() || choiceValue };
  });
}

function ConditionalLogicEditor(props: {
  value: unknown;
  fields: FieldOption[];
  onChange: (value: ConditionalLogic | null) => void;
  t: (key: string) => string;
}) {
  const logic = () => readConditional(props.value);
  const update = (next: ConditionalLogic): void => props.onChange(next.groups.some((group) => group.rules.length > 0) ? next : null);
  const updateRule = (groupIndex: number, ruleIndex: number, patch: Partial<ConditionalRule>): void => {
    const next = readConditional(props.value);
    next.groups = next.groups.map((group, index) => index === groupIndex ? { ...group, rules: group.rules.map((rule, row) => row === ruleIndex ? { ...rule, ...patch } : rule) } : group);
    update(next);
  };

  return (
    <div class="acf-conditional">
      <div class="acf-settings-heading"><strong>{props.t('settings.customFields.fieldSettings.conditionalLogic')}</strong><span class="muted">{props.t('settings.customFields.fieldSettings.conditionalHint')}</span></div>
      <For each={logic().groups}>{(group, groupIndex) => (
        <div class="acf-condition-group">
          <For each={group.rules}>{(rule, ruleIndex) => (
            <div class="acf-condition-row">
              <select class="input" value={rule.field} onChange={(event) => updateRule(groupIndex(), ruleIndex(), { field: event.currentTarget.value })}>
                <option value="">{props.t('settings.customFields.fieldSettings.chooseField')}</option>
                <For each={props.fields}>{(field) => <option value={field.value}>{field.label}</option>}</For>
              </select>
              <select class="input" value={rule.operator} onChange={(event) => updateRule(groupIndex(), ruleIndex(), { operator: event.currentTarget.value })}>
                <option value="eq">{props.t('settings.customFields.fieldSettings.operators.eq')}</option>
                <option value="neq">{props.t('settings.customFields.fieldSettings.operators.neq')}</option>
                <option value="gt">{props.t('settings.customFields.fieldSettings.operators.gt')}</option>
                <option value="lt">{props.t('settings.customFields.fieldSettings.operators.lt')}</option>
                <option value="contains">{props.t('settings.customFields.fieldSettings.operators.contains')}</option>
                <option value="has_any_value">{props.t('settings.customFields.fieldSettings.operators.hasAny')}</option>
                <option value="has_no_value">{props.t('settings.customFields.fieldSettings.operators.hasNone')}</option>
              </select>
              <Show when={!['has_any_value', 'has_no_value'].includes(rule.operator)}>
                <input class="input" value={rule.value ?? ''} placeholder={props.t('settings.customFields.fieldSettings.conditionValue')} onInput={(event) => updateRule(groupIndex(), ruleIndex(), { value: event.currentTarget.value })} />
              </Show>
              <button type="button" class="btn btn-danger btn-sm" onClick={() => update({ ...logic(), groups: logic().groups.map((item, index) => index === groupIndex() ? { ...item, rules: item.rules.filter((_, row) => row !== ruleIndex()) } : item) })}>×</button>
            </div>
          )}</For>
          <button type="button" class="btn btn-secondary btn-sm" onClick={() => update({ ...logic(), groups: logic().groups.map((item, index) => index === groupIndex() ? { ...item, rules: [...item.rules, { field: props.fields[0]?.value ?? '', operator: 'eq', value: '' }] } : item) })}>+ {props.t('settings.customFields.fieldSettings.addCondition')}</button>
        </div>
      )}</For>
      <button type="button" class="btn btn-secondary btn-sm" onClick={() => update({ ...logic(), groups: [...logic().groups, { match: 'ALL', rules: [{ field: props.fields[0]?.value ?? '', operator: 'eq', value: '' }] }] })}>+ {props.t('settings.customFields.fieldSettings.addConditionGroup')}</button>
      <Show when={logic().groups.some((group) => group.rules.length > 1)}><span class="muted">{props.t('settings.customFields.fieldSettings.conditionsAnd')}</span></Show>
    </div>
  );
}

function FieldSettings(props: {
  field: EditableField;
  fields: FieldOption[];
  fieldTypes: FieldTypeInfo[];
  categories: FieldCategoryInfo[];
  onChange: (patch: Partial<EditableField>) => void;
  t: (key: string) => string;
}) {
  const config = (key: string, fallback = ''): string => String(props.field.config[key] ?? fallback);
  const bool = (key: string, fallback = false): boolean => props.field.config[key] === undefined ? fallback : props.field.config[key] === true;
  const setConfig = (key: string, value: unknown): void => props.onChange({ config: { ...props.field.config, [key]: value } });
  const label = (key: string): string => props.t(`settings.customFields.fieldSettings.${key}`);
  const type = () => props.field.type;

  return (
    <div class="acf-field-settings">
      <div class="acf-settings-section">
        <h5>{label('general')}</h5>
        <div class="acf-settings-grid">
          <label>{label('fieldLabel')}<input class="input" value={props.field.label} onInput={(event) => props.onChange({ label: event.currentTarget.value })} /></label>
          <label>{label('fieldName')}<input class="input" pattern="[a-zA-Z0-9_-]+" value={props.field.name} onInput={(event) => props.onChange({ name: event.currentTarget.value })} /></label>
          <label class="acf-settings-wide">{label('instructions')}<textarea class="input" rows={2} value={props.field.instructions ?? ''} onInput={(event) => props.onChange({ instructions: event.currentTarget.value })} /></label>
          <label class="checkbox-label"><input type="checkbox" checked={props.field.required} onChange={(event) => props.onChange({ required: event.currentTarget.checked })} /> {label('required')}</label>
          <label>{label('defaultValue')}<input class="input" value={config('defaultValue')} onInput={(event) => setConfig('defaultValue', event.currentTarget.value)} /></label>
          <label>{label('placeholder')}<input class="input" value={config('placeholder')} onInput={(event) => setConfig('placeholder', event.currentTarget.value)} /></label>
        </div>
      </div>

      <div class="acf-settings-section">
        <h5>{label('presentation')}</h5>
        <div class="acf-settings-grid">
          <label>{label('wrapperWidth')}<input class="input" type="number" min={0} max={100} value={config('wrapperWidth')} onInput={(event) => setConfig('wrapperWidth', event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} /></label>
          <label>{label('labelPlacement')}<select class="input" value={config('labelPlacement', 'top')} onChange={(event) => setConfig('labelPlacement', event.currentTarget.value)}><option value="top">{label('top')}</option><option value="left">{label('left')}</option></select></label>
          <label>{label('instructionPlacement')}<select class="input" value={config('instructionPlacement', 'below')} onChange={(event) => setConfig('instructionPlacement', event.currentTarget.value)}><option value="above">{label('above')}</option><option value="below">{label('below')}</option></select></label>
        </div>
      </div>

      <Show when={['text', 'textarea', 'email', 'url', 'password'].includes(type())}>
        <div class="acf-settings-section"><h5>{label('textSettings')}</h5><div class="acf-settings-grid">
          <label>{label('prepend')}<input class="input" value={config('prepend')} onInput={(event) => setConfig('prepend', event.currentTarget.value)} /></label>
          <label>{label('append')}<input class="input" value={config('append')} onInput={(event) => setConfig('append', event.currentTarget.value)} /></label>
          <label>{label('minLength')}<input class="input" type="number" min={0} value={config('minLength')} onInput={(event) => setConfig('minLength', event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} /></label>
          <label>{label('maxLength')}<input class="input" type="number" min={0} value={config('maxLength')} onInput={(event) => setConfig('maxLength', event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} /></label>
          <Show when={type() === 'textarea'}><label>{label('rows')}<input class="input" type="number" min={1} value={config('rows', '4')} onInput={(event) => setConfig('rows', Number(event.currentTarget.value) || 4)} /></label><label>{label('newLines')}<select class="input" value={config('newLines', 'br')} onChange={(event) => setConfig('newLines', event.currentTarget.value)}><option value="br">&lt;br&gt;</option><option value="wpautop">{label('wpautop')}</option><option value="none">{label('none')}</option></select></label></Show>
        </div></div>
      </Show>

      <Show when={['number', 'range'].includes(type())}>
        <div class="acf-settings-section"><h5>{label('numberSettings')}</h5><div class="acf-settings-grid"><label>{label('min')}<input class="input" type="number" value={config('min')} onInput={(event) => setConfig('min', event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} /></label><label>{label('max')}<input class="input" type="number" value={config('max')} onInput={(event) => setConfig('max', event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} /></label><label>{label('step')}<input class="input" type="number" step="any" value={config('step', '1')} onInput={(event) => setConfig('step', Number(event.currentTarget.value) || 1)} /></label></div></div>
      </Show>

      <Show when={CHOICE_TYPES.has(type())}>
        <div class="acf-settings-section"><h5>{label('choiceSettings')}</h5><div class="acf-settings-grid"><label class="acf-settings-wide">{label('choices')}<textarea class="input" rows={5} value={textChoices(props.field.config['choices'] ?? props.field.config['options'])} placeholder="valor|Rótulo" onInput={(event) => setConfig('choices', parseChoices(event.currentTarget.value))} /></label><label>{label('layout')}<select class="input" value={config('layout', 'vertical')} onChange={(event) => setConfig('layout', event.currentTarget.value)}><option value="vertical">{label('vertical')}</option><option value="horizontal">{label('horizontal')}</option></select></label><label class="checkbox-label"><input type="checkbox" checked={bool('multiple')} onChange={(event) => setConfig('multiple', event.currentTarget.checked)} /> {label('multiple')}</label><label class="checkbox-label"><input type="checkbox" checked={bool('allowNull')} onChange={(event) => setConfig('allowNull', event.currentTarget.checked)} /> {label('allowNull')}</label></div></div>
      </Show>

      <Show when={MEDIA_TYPES.has(type())}>
        <div class="acf-settings-section"><h5>{label('mediaSettings')}</h5><div class="acf-settings-grid"><label>{label('returnFormat')}<select class="input" value={config('returnFormat', type() === 'gallery' ? 'array' : 'array')} onChange={(event) => setConfig('returnFormat', event.currentTarget.value)}><option value="array">{label('array')}</option><option value="id">{label('id')}</option><option value="url">URL</option></select></label><label>{label('previewSize')}<input class="input" value={config('previewSize', 'medium')} onInput={(event) => setConfig('previewSize', event.currentTarget.value)} /></label><label>{label('library')}<select class="input" value={config('library', 'all')} onChange={(event) => setConfig('library', event.currentTarget.value)}><option value="all">{label('all')}</option><option value="uploadedToPost">{label('uploadedToPost')}</option></select></label><label>{label('allowedTypes')}<input class="input" value={config('mimeTypes')} placeholder="jpg, png, pdf" onInput={(event) => setConfig('mimeTypes', event.currentTarget.value)} /></label><label>{label('minWidth')}<input class="input" type="number" value={config('minWidth')} onInput={(event) => setConfig('minWidth', event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} /></label><label>{label('maxWidth')}<input class="input" type="number" value={config('maxWidth')} onInput={(event) => setConfig('maxWidth', event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} /></label><label>{label('minHeight')}<input class="input" type="number" value={config('minHeight')} onInput={(event) => setConfig('minHeight', event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} /></label><label>{label('maxHeight')}<input class="input" type="number" value={config('maxHeight')} onInput={(event) => setConfig('maxHeight', event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} /></label></div></div>
      </Show>

      <Show when={type() === 'wysiwyg'}><div class="acf-settings-section"><h5>{label('wysiwygSettings')}</h5><div class="acf-settings-grid"><label>{label('tabs')}<select class="input" value={config('tabs', 'all')} onChange={(event) => setConfig('tabs', event.currentTarget.value)}><option value="all">{label('all')}</option><option value="visual">Visual</option><option value="text">Text</option></select></label><label>{label('toolbar')}<select class="input" value={config('toolbar', 'full')} onChange={(event) => setConfig('toolbar', event.currentTarget.value)}><option value="full">Full</option><option value="basic">Basic</option></select></label><label class="checkbox-label"><input type="checkbox" checked={bool('mediaUpload', true)} onChange={(event) => setConfig('mediaUpload', event.currentTarget.checked)} /> {label('mediaUpload')}</label></div></div></Show>
      <Show when={['date_picker', 'date_time_picker', 'time_picker'].includes(type())}><div class="acf-settings-section"><h5>{label('dateSettings')}</h5><div class="acf-settings-grid"><label>{label('displayFormat')}<input class="input" value={config('displayFormat', type() === 'time_picker' ? 'H:i' : 'd/m/Y')} onInput={(event) => setConfig('displayFormat', event.currentTarget.value)} /></label><label>{label('returnFormat')}<input class="input" value={config('returnFormat', 'Y-m-d')} onInput={(event) => setConfig('returnFormat', event.currentTarget.value)} /></label><label>{label('firstDay')}<input class="input" type="number" min={0} max={6} value={config('firstDay', '1')} onInput={(event) => setConfig('firstDay', Number(event.currentTarget.value) || 0)} /></label></div></div></Show>
      <Show when={type() === 'color_picker'}><div class="acf-settings-section"><h5>{label('colorSettings')}</h5><label class="checkbox-label"><input type="checkbox" checked={bool('enableOpacity')} onChange={(event) => setConfig('enableOpacity', event.currentTarget.checked)} /> {label('enableOpacity')}</label></div></Show>
      <Show when={type() === 'google_map'}><div class="acf-settings-section"><h5>{label('mapSettings')}</h5><div class="acf-settings-grid"><label>{label('center')}<input class="input" value={config('center')} onInput={(event) => setConfig('center', event.currentTarget.value)} /></label><label>{label('zoom')}<input class="input" type="number" value={config('zoom', '14')} onInput={(event) => setConfig('zoom', Number(event.currentTarget.value) || 14)} /></label><label>{label('height')}<input class="input" value={config('height', '400')} onInput={(event) => setConfig('height', Number(event.currentTarget.value) || 400)} /></label></div></div></Show>
      <Show when={RELATION_TYPES.has(type())}><div class="acf-settings-section"><h5>{label('relationSettings')}</h5><div class="acf-settings-grid"><label>{label('postType')}<input class="input" value={config('postType')} onInput={(event) => setConfig('postType', event.currentTarget.value)} /></label><label>{label('taxonomy')}<input class="input" value={config('taxonomy')} onInput={(event) => setConfig('taxonomy', event.currentTarget.value)} /></label><label>{label('returnFormat')}<select class="input" value={config('returnFormat', 'id')} onChange={(event) => setConfig('returnFormat', event.currentTarget.value)}><option value="id">ID</option><option value="object">Object</option><option value="array">Array</option></select></label><label class="checkbox-label"><input type="checkbox" checked={bool('multiple', type() !== 'page_link')} onChange={(event) => setConfig('multiple', event.currentTarget.checked)} /> {label('multiple')}</label><label class="checkbox-label"><input type="checkbox" checked={bool('allowNull', true)} onChange={(event) => setConfig('allowNull', event.currentTarget.checked)} /> {label('allowNull')}</label></div></div></Show>
      <Show when={type() === 'true_false'}><div class="acf-settings-section"><h5>{label('booleanSettings')}</h5><div class="acf-settings-grid"><label>{label('message')}<input class="input" value={config('message')} onInput={(event) => setConfig('message', event.currentTarget.value)} /></label><label class="checkbox-label"><input type="checkbox" checked={bool('defaultValue')} onChange={(event) => setConfig('defaultValue', event.currentTarget.checked)} /> {label('defaultChecked')}</label></div></div></Show>
      <Show when={type() === 'link'}><div class="acf-settings-section"><h5>{label('linkSettings')}</h5><label>{label('returnFormat')}<select class="input" value={config('returnFormat', 'array')} onChange={(event) => setConfig('returnFormat', event.currentTarget.value)}><option value="array">Array</option><option value="url">URL</option><option value="id">ID</option></select></label></div></Show>
      <Show when={type() === 'clone'}><div class="acf-settings-section"><h5>{label('cloneSettings')}</h5><label class="acf-settings-wide">{label('cloneFields')}<textarea class="input" rows={3} value={Array.isArray(props.field.config['clone']) ? (props.field.config['clone'] as unknown[]).join('\n') : ''} placeholder={label('cloneHint')} onInput={(event) => setConfig('clone', event.currentTarget.value.split('\n').map((item) => item.trim()).filter(Boolean))} /></label></div></Show>

      <Show when={CONTAINER_TYPES.has(type())}><div class="acf-settings-section"><h5>{label('containerSettings')}</h5><div class="acf-settings-grid"><label>{label('layout')}<select class="input" value={config('layout', 'block')} onChange={(event) => setConfig('layout', event.currentTarget.value)}><option value="block">Block</option><option value="table">Table</option><option value="row">Row</option></select></label><label>{label('min')}<input class="input" type="number" min={0} value={config('min')} onInput={(event) => setConfig('min', event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} /></label><label>{label('max')}<input class="input" type="number" min={0} value={config('max')} onInput={(event) => setConfig('max', event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} /></label><label>{label('buttonLabel')}<input class="input" value={config('buttonLabel', 'Add Row')} onInput={(event) => setConfig('buttonLabel', event.currentTarget.value)} /></label><label>{label('collapsed')}<input class="input" value={config('collapsed')} placeholder="field_name" onInput={(event) => setConfig('collapsed', event.currentTarget.value)} /></label></div></div></Show>

      <ConditionalLogicEditor value={props.field.conditionalLogic} fields={props.fields.filter((field) => field.value !== props.field.name)} onChange={(value) => props.onChange({ conditionalLogic: value })} t={props.t} />
    </div>
  );
}

function FieldListEditor(props: {
  fields: EditableField[];
  types: FieldTypeInfo[];
  categories: FieldCategoryInfo[];
  options: FieldOption[];
  depth: number;
  t: (key: string) => string;
  onChange: (fields: EditableField[]) => void;
  expandedId: () => string | null;
  setExpandedId: (id: string | null) => void;
}) {
  const [draggingId, setDraggingId] = createSignal<string | null>(null);
  const move = (fromId: string, toId: string): void => {
    if (fromId === toId) return;
    const from = props.fields.findIndex((field) => field.clientId === fromId);
    const to = props.fields.findIndex((field) => field.clientId === toId);
    if (from < 0 || to < 0) return;
    const next = [...props.fields];
    const [item] = next.splice(from, 1);
    if (item) next.splice(to, 0, item);
    props.onChange(next);
  };
  const patchField = (id: string, patch: Partial<EditableField>): void => props.onChange(updateFieldInList(props.fields, id, patch));
  const addNested = (field: EditableField): void => patchField(field.clientId, { subFields: [...field.subFields, emptyField(field.subFields.length, props.t('settings.customFields.form.newFieldDefault'))] });

  return (
    <div class="acf-fields-list" data-depth={props.depth}>
      <For each={props.fields}>{(field, index) => (
        <article
          class="acf-field-row"
          classList={{ 'is-expanded': props.expandedId() === field.clientId, 'is-dragging': draggingId() === field.clientId }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); const from = draggingId() ?? event.dataTransfer?.getData('text/plain'); if (from) move(from, field.clientId); setDraggingId(null); }}
        >
          <div class="acf-field-header">
            <span
              class="acf-drag-handle"
              data-drag-handle="true"
              draggable="true"
              title={props.t('settings.customFields.form.dragHint')}
              onDragStart={(event) => { setDraggingId(field.clientId); event.dataTransfer?.setData('text/plain', field.clientId); event.dataTransfer?.setData('application/x-okcms-field-id', field.clientId); }}
              onDragEnd={() => setDraggingId(null)}
            >⠿⠿⠿</span>
            <button type="button" class="acf-field-toggle" onClick={() => props.setExpandedId(props.expandedId() === field.clientId ? null : field.clientId)}>
              <span class="acf-field-number">{index() + 1}</span>
              <span class="acf-field-title"><strong>{field.label || props.t('settings.customFields.form.newFieldDefault')}</strong><small>{field.name} · {fieldTypeLabel(field, props.types)}</small></span>
              <span class="acf-field-chevron">{props.expandedId() === field.clientId ? '▴' : '▾'}</span>
            </button>
            <button type="button" class="btn btn-danger btn-sm" onClick={() => props.onChange(props.fields.filter((item) => item.clientId !== field.clientId))}>{props.t('settings.customFields.form.removeField')}</button>
          </div>
          <Show when={props.expandedId() === field.clientId}>
            <div class="acf-field-body">
              <div class="acf-field-type-row"><label>{props.t('settings.customFields.form.fieldType')}</label><FieldTypePicker categories={props.categories} types={props.types} value={field.type} onChange={(type) => patchField(field.clientId, { type })} /></div>
              <FieldSettings field={field} fields={props.options} fieldTypes={props.types} categories={props.categories} onChange={(patch) => patchField(field.clientId, patch)} t={props.t} />
              <Show when={CONTAINER_TYPES.has(field.type)}>
                <div class="acf-nested-fields"><div class="acf-nested-heading"><h5>{props.t('settings.customFields.fieldSettings.subFields')}</h5><button type="button" class="btn btn-secondary btn-sm" onClick={() => addNested(field)}>+ {props.t('settings.customFields.form.addField')}</button></div><FieldListEditor fields={field.subFields} types={props.types} categories={props.categories} options={props.options} depth={props.depth + 1} t={props.t} onChange={(subFields) => patchField(field.clientId, { subFields })} expandedId={props.expandedId} setExpandedId={props.setExpandedId} /></div>
              </Show>
              <Show when={field.type === 'flexible_content'}><FlexibleLayoutsEditor field={field} types={props.types} categories={props.categories} options={props.options} t={props.t} onChange={(patch) => patchField(field.clientId, patch)} expandedId={props.expandedId} setExpandedId={props.setExpandedId} /></Show>
            </div>
          </Show>
        </article>
      )}</For>
    </div>
  );
}

function FlexibleLayoutsEditor(props: { field: EditableField; types: FieldTypeInfo[]; categories: FieldCategoryInfo[]; options: FieldOption[]; t: (key: string) => string; onChange: (patch: Partial<EditableField>) => void; expandedId: () => string | null; setExpandedId: (id: string | null) => void }) {
  const layouts = () => props.field.layouts;
  const updateLayout = (id: string, patch: Partial<EditableLayout>): void => props.onChange({ layouts: layouts().map((layout) => layout.clientId === id ? { ...layout, ...patch } : layout) });
  const addLayout = (): void => props.onChange({ layouts: [...layouts(), { clientId: clientId('layout'), name: `layout_${layouts().length + 1}`, label: props.t('settings.customFields.fieldSettings.newLayout'), display: 'block', subFields: [] }] });
  return <div class="acf-layouts"><div class="acf-nested-heading"><h5>{props.t('settings.customFields.fieldSettings.layouts')}</h5><button type="button" class="btn btn-secondary btn-sm" onClick={addLayout}>+ {props.t('settings.customFields.fieldSettings.addLayout')}</button></div><For each={layouts()}>{(layout, index) => <div class="acf-layout-card"><div class="acf-settings-grid"><label>{props.t('settings.customFields.fieldSettings.layoutName')}<input class="input" value={layout.name} onInput={(event) => updateLayout(layout.clientId, { name: event.currentTarget.value })} /></label><label>{props.t('settings.customFields.fieldSettings.layoutLabel')}<input class="input" value={layout.label} onInput={(event) => updateLayout(layout.clientId, { label: event.currentTarget.value })} /></label><label>{props.t('settings.customFields.fieldSettings.layoutDisplay')}<select class="input" value={layout.display ?? 'block'} onChange={(event) => updateLayout(layout.clientId, { display: event.currentTarget.value })}><option value="block">Block</option><option value="table">Table</option><option value="row">Row</option></select></label><button type="button" class="btn btn-danger btn-sm" onClick={() => props.onChange({ layouts: layouts().filter((item) => item.clientId !== layout.clientId) })}>{props.t('settings.customFields.form.removeField')}</button></div><div class="acf-nested-fields"><div class="acf-nested-heading"><h5>{props.t('settings.customFields.fieldSettings.subFields')} · {index() + 1}</h5><button type="button" class="btn btn-secondary btn-sm" onClick={() => updateLayout(layout.clientId, { subFields: [...layout.subFields, emptyField(layout.subFields.length, props.t('settings.customFields.form.newFieldDefault'))] })}>+ {props.t('settings.customFields.form.addField')}</button></div><FieldListEditor fields={layout.subFields} types={props.types} categories={props.categories} options={props.options} depth={2} t={props.t} onChange={(subFields) => updateLayout(layout.clientId, { subFields })} expandedId={props.expandedId} setExpandedId={props.setExpandedId} /></div></div>}</For></div>;
}

export function CustomFieldsManager() {
  const { t } = useTranslation();
  const [contentTypes, setContentTypes] = createSignal<ContentType[]>([]);
  const [taxonomies, setTaxonomies] = createSignal<Taxonomy[]>([]);
  const [groups, setGroups] = createSignal<FieldGroup[]>([]);
  const [fieldTypes, setFieldTypes] = createSignal<FieldTypeInfo[]>([]);
  const [categories, setCategories] = createSignal<FieldCategoryInfo[]>([]);
  const [selectedType, setSelectedType] = createSignal('');
  const [search, setSearch] = createSignal('');
  const [draft, setDraft] = createSignal<FieldGroupDraft | null>(null);
  const [expandedFieldId, setExpandedFieldId] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal('');
  const [notice, setNotice] = createSignal('');

  const selectedContentType = createMemo(() => contentTypes().find((type) => type.slug === selectedType()));
  const coreGroup = createMemo(() => groups().find((group) => group.key === `core-fields-${selectedType()}`));
  const groupContentTypes = (group: FieldGroup): string[] => [...new Set((group.locationRules ?? []).flat().filter((rule) => rule.param === 'content_type' && rule.operator === 'eq' && rule.value).map((rule) => rule.value))];
  const customGroups = createMemo(() => groups().filter((group) => {
    if (group.key.startsWith('core-fields-')) return false;
    const targets = groupContentTypes(group);
    const matchesType = !selectedType() || targets.length === 0 || targets.includes(selectedType());
    return matchesType && (!search().trim() || group.title.toLowerCase().includes(search().trim().toLowerCase()) || group.key.toLowerCase().includes(search().trim().toLowerCase()));
  }));
  const standardFields = createMemo(() => STANDARD_FIELD_KEYS.map((key) => ({ key, label: t(`settings.customFields.standard.fields.${key}`), type: coreGroup()?.fields.find((field) => field.coreFieldKey === key || field.name === key)?.type ?? 'text', locked: key === 'title' || key === 'slug' || Boolean(coreGroup()?.fields.find((field) => field.coreFieldKey === key)?.isLocked) })));
  const enabledStandardFields = createMemo(() => new Set(selectedContentType()?.defaultFields?.length ? selectedContentType()!.defaultFields : STANDARD_FIELD_KEYS));
  const fieldOptions = createMemo(() => { const result: FieldOption[] = []; const walk = (fields: EditableField[]): void => fields.forEach((field) => { result.push({ value: field.name, label: `${field.label || field.name} (${field.name})` }); walk(field.subFields); field.layouts.forEach((layout) => walk(layout.subFields)); }); if (draft()) walk(draft()!.fields); return result; });

  const load = async (): Promise<void> => {
    setLoading(true); setError('');
    try {
      const [types, taxonomyList, catalog, summaries] = await Promise.all([apiClient.getContentTypes(), apiClient.getTaxonomies(), apiClient.getFieldTypes(), apiClient.getFieldGroups()]);
      const details = await Promise.all(summaries.map((summary) => apiClient.getFieldGroup(summary.id)));
      setContentTypes(types); setTaxonomies(taxonomyList); setFieldTypes(catalog.types); setCategories(catalog.categories); setGroups(details);
      if (!selectedType() && types[0]) setSelectedType(types[0].slug);
    } catch (err) { setError(err instanceof Error ? err.message : t('settings.customFields.loadError')); }
    finally { setLoading(false); }
  };
  onMount(load);

  const startNew = (): void => { setNotice(''); setError(''); setExpandedFieldId(null); setDraft({ title: '', position: 'normal', displayStyle: 'standard', active: true, locationRules: [[emptyLocationRule(selectedType())]], fields: [], metadata: { labelPlacement: 'top', instructionPlacement: 'below', hideOnScreen: [] } }); };
  const editGroup = (group: FieldGroup): void => { setNotice(''); setError(''); const fields = group.fields.map(cloneField); setExpandedFieldId(fields[0]?.clientId ?? null); setDraft({ id: group.id, title: group.title, position: group.position ?? 'normal', displayStyle: group.displayStyle ?? 'standard', active: group.active !== false, locationRules: normalizeLocationRules(group.locationRules, selectedType()), fields, metadata: { ...((group.metadata ?? {}) as FieldGroupMetadata) } }); };
  const locationValueOptions = (param: LocationRule['param']): FieldOption[] => { if (param === 'content_type') return contentTypes().map((type) => ({ value: type.slug, label: `${type.pluralLabel} (${type.slug})` })); if (param === 'taxonomy') return taxonomies().map((taxonomy) => ({ value: taxonomy.slug, label: `${taxonomy.name} (${taxonomy.slug})` })); if (param === 'post_status') return ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'TRASHED'].map((status) => ({ value: status, label: status })); return []; };
  const updateDraft = (patch: Partial<FieldGroupDraft>): void => { const current = draft(); if (current) setDraft({ ...current, ...patch }); };
  const updateMetadata = (patch: Partial<FieldGroupMetadata>): void => { const current = draft(); if (current) setDraft({ ...current, metadata: { ...current.metadata, ...patch } }); };
  const updateLocationRule = (groupIndex: number, ruleIndex: number, patch: Partial<LocationRule>): void => { const current = draft(); if (current) setDraft({ ...current, locationRules: current.locationRules.map((group, index) => index === groupIndex ? group.map((rule, row) => row === ruleIndex ? { ...rule, ...patch } : rule) : group) }); };
  const addLocationRule = (groupIndex: number): void => { const current = draft(); if (current) setDraft({ ...current, locationRules: current.locationRules.map((group, index) => index === groupIndex ? [...group, emptyLocationRule(selectedType())] : group) }); };
  const removeLocationRule = (groupIndex: number, ruleIndex: number): void => { const current = draft(); if (!current) return; const next = current.locationRules.map((group, index) => index === groupIndex ? group.filter((_, row) => row !== ruleIndex) : group).filter((group) => group.length > 0); setDraft({ ...current, locationRules: next.length > 0 ? next : [[emptyLocationRule(selectedType())]] }); };
  const addLocationGroup = (): void => { const current = draft(); if (current) setDraft({ ...current, locationRules: [...current.locationRules, [emptyLocationRule(selectedType())]] }); };
  const draftContentType = (rules: LocationRule[][]): string => rules.flat().find((rule) => rule.param === 'content_type' && rule.operator === 'eq')?.value ?? selectedType();
  const updateDraftContentType = (value: string): void => { const current = draft(); if (!current) return; const rules = current.locationRules.map((group) => [...group]); const first = rules[0] ?? []; const index = first.findIndex((rule) => rule.param === 'content_type'); if (index >= 0) first[index] = { ...first[index]!, operator: 'eq', value }; else first.unshift(emptyLocationRule(value)); rules[0] = first; setDraft({ ...current, locationRules: rules }); };
  const locationSummary = (group: FieldGroup): string => { const targets = groupContentTypes(group); return targets.length === 0 ? t('settings.customFields.groups.allContentTypes') : targets.map((slug) => contentTypes().find((type) => type.slug === slug)?.pluralLabel ?? slug).join(', '); };

  const saveGroup = async (event: Event): Promise<void> => {
    event.preventDefault(); const current = draft(); if (!current) return;
    if (!current.title.trim() || current.locationRules.some((group) => group.some((rule) => !rule.value.trim()))) { setError(t('settings.customFields.location.required')); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const payload = { title: current.title.trim(), locationRules: current.locationRules, position: current.position, displayStyle: current.displayStyle, active: current.active, metadata: current.metadata, fields: current.fields.map((field, index) => toPayloadField(field, index)) };
      if (current.id) await apiClient.updateFieldGroup(current.id, payload); else await apiClient.createFieldGroup(payload);
      setDraft(null); setExpandedFieldId(null); setNotice(t('settings.customFields.form.saved')); await load();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setSaving(false); }
  };
  const toggleStandardField = async (key: string): Promise<void> => { const type = selectedContentType(); const field = standardFields().find((entry) => entry.key === key); if (!type || !field || field.locked) return; const next = new Set(enabledStandardFields()); if (next.has(key)) next.delete(key); else next.add(key); next.add('title'); next.add('slug'); try { const updated = await apiClient.updateContentType(type.slug, { defaultFields: [...next] }); setContentTypes((current) => current.map((entry) => entry.slug === updated.slug ? updated : entry)); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } };
  const deleteGroup = async (group: FieldGroup): Promise<void> => { if (!window.confirm(t('settings.customFields.actions.confirmDelete'))) return; try { await apiClient.deleteFieldGroup(group.id); setNotice(t('settings.customFields.form.deleted')); await load(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } };

  return <div class="custom-fields-manager">
    <Show when={error()}><div class="notice notice--error">{error()}</div></Show><Show when={notice()}><div class="notice">{notice()}</div></Show>
    <Show when={!loading()} fallback={<p class="muted">{t('settings.customFields.loading')}</p>}>
      <Show when={!draft()} fallback={<form class="acf-builder" onSubmit={saveGroup}><div class="acf-builder-header"><div><button type="button" class="btn btn-secondary" onClick={() => setDraft(null)}>← {t('settings.customFields.form.backToGroups')}</button><span class="acf-eyebrow">{t('settings.customFields.form.editorEyebrow')}</span><h3>{draft()!.id ? t('settings.customFields.form.editTitle') : t('settings.customFields.form.createTitle')}</h3></div><div class="editor-actions"><button type="button" class="btn btn-secondary" onClick={() => setDraft(null)}>{t('settings.customFields.form.cancel')}</button><button type="submit" class="btn btn-primary" disabled={saving()}>{saving() ? t('common.loading') : t('settings.customFields.form.save')}</button></div></div>
        <section class="card acf-group-identity"><label>{t('settings.customFields.form.title')}<input class="input acf-group-title" required value={draft()!.title} placeholder={t('settings.customFields.form.titlePlaceholder')} onInput={(event) => updateDraft({ title: event.currentTarget.value })} /></label><p class="muted">{t('settings.customFields.form.groupTitleHint')}</p></section>
        <section class="card acf-builder-section"><div class="acf-section-header"><div><h4>{t('settings.customFields.form.fieldsTitle')}</h4><p class="muted">{t('settings.customFields.form.fieldsDescription')}</p></div><button type="button" class="btn btn-primary" onClick={() => { const current = draft(); if (!current) return; const field = emptyField(current.fields.length, t('settings.customFields.form.newFieldDefault')); updateDraft({ fields: [...current.fields, field] }); setExpandedFieldId(field.clientId); }}>{t('settings.customFields.form.addField')}</button></div><Show when={draft()!.fields.length > 0} fallback={<div class="acf-empty-fields">{t('settings.customFields.form.noFields')}</div>}><FieldListEditor fields={draft()!.fields} types={fieldTypes()} categories={categories()} options={fieldOptions()} depth={0} t={t} onChange={(fields) => updateDraft({ fields })} expandedId={expandedFieldId} setExpandedId={setExpandedFieldId} /></Show></section>
        <section class="card acf-builder-section"><div class="acf-section-header"><div><h4>{t('settings.customFields.location.title')}</h4><p class="muted">{t('settings.customFields.location.description')}</p></div><button type="button" class="btn btn-secondary" onClick={addLocationGroup}>+ {t('settings.customFields.location.addGroup')}</button></div><div class="acf-assignment"><label>{t('settings.customFields.form.contentType')}<select class="input" value={draftContentType(draft()!.locationRules)} onChange={(event) => updateDraftContentType(event.currentTarget.value)}><For each={contentTypes()}>{(type) => <option value={type.slug}>{type.pluralLabel} ({type.slug})</option>}</For></select></label></div><For each={draft()!.locationRules}>{(ruleGroup, groupIndex) => <div class="location-rule-group"><Show when={groupIndex() > 0}><div class="rule-connector">{t('settings.customFields.location.or')}</div></Show><For each={ruleGroup}>{(rule, ruleIndex) => <div class="location-rule-row"><select class="input" value={rule.param} onChange={(event) => { const param = event.currentTarget.value as LocationRule['param']; updateLocationRule(groupIndex(), ruleIndex(), { param, value: locationValueOptions(param)[0]?.value ?? '' }); }}>{LOCATION_PARAMS.map((param) => <option value={param}>{t(`settings.customFields.location.params.${param}`)}</option>)}</select><select class="input" value={rule.operator} onChange={(event) => updateLocationRule(groupIndex(), ruleIndex(), { operator: event.currentTarget.value as LocationRule['operator'] })}><option value="eq">{t('settings.customFields.location.operators.eq')}</option><option value="neq">{t('settings.customFields.location.operators.neq')}</option></select><Show when={locationValueOptions(rule.param).length > 0} fallback={<input class="input" required value={rule.value} onInput={(event) => updateLocationRule(groupIndex(), ruleIndex(), { value: event.currentTarget.value })} />}><select class="input" required value={rule.value} onChange={(event) => updateLocationRule(groupIndex(), ruleIndex(), { value: event.currentTarget.value })}><option value="">{t('settings.customFields.location.chooseValue')}</option><For each={locationValueOptions(rule.param)}>{(option) => <option value={option.value}>{option.label}</option>}</For></select></Show><button type="button" class="btn btn-danger btn-sm" onClick={() => removeLocationRule(groupIndex(), ruleIndex())}>{t('settings.customFields.location.remove')}</button></div>}</For><button type="button" class="btn btn-secondary btn-sm" onClick={() => addLocationRule(groupIndex())}>+ {t('settings.customFields.location.addRule')}</button></div>}</For></section>
        <section class="card acf-builder-section"><div class="acf-section-header"><div><h4>{t('settings.customFields.form.settingsTitle')}</h4><p class="muted">{t('settings.customFields.form.settingsDescription')}</p></div></div><div class="acf-settings-grid"><label class="acf-settings-wide">{t('settings.customFields.form.description')}<textarea class="input" rows={3} value={draft()!.metadata.description ?? ''} onInput={(event) => updateMetadata({ description: event.currentTarget.value })} /></label><label>{t('settings.customFields.form.position')}<select class="input" value={draft()!.position} onChange={(event) => updateDraft({ position: event.currentTarget.value as FieldGroupDraft['position'] })}><option value="normal">{t('settings.customFields.form.positions.normal')}</option><option value="side">{t('settings.customFields.form.positions.side')}</option><option value="acf_after_title">{t('settings.customFields.form.positions.acf_after_title')}</option></select></label><label>{t('settings.customFields.form.displayStyle')}<select class="input" value={draft()!.displayStyle} onChange={(event) => updateDraft({ displayStyle: event.currentTarget.value as FieldGroupDraft['displayStyle'] })}><option value="standard">{t('settings.customFields.form.displayStyles.standard')}</option><option value="seamless">{t('settings.customFields.form.displayStyles.seamless')}</option><option value="grouped">{t('settings.customFields.form.displayStyles.grouped')}</option></select></label><label>{t('settings.customFields.form.labelPlacement')}<select class="input" value={draft()!.metadata.labelPlacement ?? 'top'} onChange={(event) => updateMetadata({ labelPlacement: event.currentTarget.value as LabelPlacement })}><option value="top">{t('settings.customFields.fieldSettings.top')}</option><option value="left">{t('settings.customFields.fieldSettings.left')}</option></select></label><label>{t('settings.customFields.form.instructionPlacement')}<select class="input" value={draft()!.metadata.instructionPlacement ?? 'below'} onChange={(event) => updateMetadata({ instructionPlacement: event.currentTarget.value as InstructionPlacement })}><option value="above">{t('settings.customFields.fieldSettings.above')}</option><option value="below">{t('settings.customFields.fieldSettings.below')}</option></select></label><label>{t('settings.customFields.form.menuOrder')}<input class="input" type="number" value={draft()!.metadata.menuOrder ?? ''} onInput={(event) => updateMetadata({ menuOrder: event.currentTarget.value ? Number(event.currentTarget.value) : undefined })} /></label><label class="checkbox-label"><input type="checkbox" checked={draft()!.active} onChange={(event) => updateDraft({ active: event.currentTarget.checked })} /> {t('settings.customFields.groups.active')}</label></div><div class="acf-hide-on-screen"><strong>{t('settings.customFields.form.hideOnScreen')}</strong><For each={['permalink', 'content', 'excerpt', 'featured_image', 'author', 'revisions', 'comments']}>{(item) => <label class="checkbox-label"><input type="checkbox" checked={(draft()!.metadata.hideOnScreen ?? []).includes(item)} onChange={(event) => updateMetadata({ hideOnScreen: event.currentTarget.checked ? [...(draft()!.metadata.hideOnScreen ?? []), item] : (draft()!.metadata.hideOnScreen ?? []).filter((entry) => entry !== item) })} /> {t(`settings.customFields.form.hide.${item}`)}</label>}</For></div></section>
      </form>}>
        <div class="acf-list-header"><div><span class="acf-eyebrow">{t('settings.customFields.listEyebrow')}</span><h3>{t('settings.customFields.groups.title')}</h3><p class="muted">{t('settings.customFields.description')}</p></div><button type="button" class="btn btn-primary" onClick={startNew}>+ {t('settings.customFields.groups.new')}</button></div>
        <div class="acf-list-toolbar"><label>{t('settings.customFields.contentType')}<select class="input" value={selectedType()} onChange={(event) => setSelectedType(event.currentTarget.value)}><option value="">{t('settings.customFields.groups.allContentTypes')}</option><For each={contentTypes()}>{(type) => <option value={type.slug}>{type.pluralLabel} ({type.slug})</option>}</For></select></label><input class="input" value={search()} placeholder={t('settings.customFields.groups.search')} onInput={(event) => setSearch(event.currentTarget.value)} /></div>
        <section class="card acf-groups-card"><Show when={customGroups().length > 0} fallback={<div class="acf-empty-groups"><div class="acf-empty-icon">✣</div><h4>{t('settings.customFields.groups.empty')}</h4><p class="muted">{t('settings.customFields.groups.emptyHint')}</p><button type="button" class="btn btn-primary" onClick={startNew}>{t('settings.customFields.groups.new')}</button></div>}><div class="acf-groups-table"><div class="acf-groups-table__head"><span>{t('settings.customFields.groups.groupName')}</span><span>{t('settings.customFields.groups.appliesTo')}</span><span>{t('settings.customFields.groups.fields')}</span><span>{t('settings.customFields.groups.status')}</span><span /></div><For each={customGroups()}>{(group) => <div class="acf-group-list-row"><div><strong>{group.title}</strong><small>{group.key}</small><Show when={group.metadata?.['description']}><small>{String(group.metadata?.['description'])}</small></Show></div><span>{locationSummary(group)}</span><span>{group.fields.length}</span><span class="badge" classList={{ 'badge-success': group.active !== false, 'badge-secondary': group.active === false }}>{group.active !== false ? t('settings.customFields.groups.active') : t('settings.customFields.groups.inactive')}</span><div class="acf-group-actions"><button type="button" class="btn btn-secondary btn-sm" onClick={() => editGroup(group)}>{t('settings.customFields.groups.edit')}</button><button type="button" class="btn btn-danger btn-sm" onClick={() => void deleteGroup(group)}>{t('settings.customFields.actions.delete')}</button></div></div>}</For></div></Show></section>
        <section class="card standard-fields-card"><div class="section-heading"><div><h4>{t('settings.customFields.standard.title')}</h4><p class="muted">{t('settings.customFields.standard.description')}</p></div></div><div class="standard-fields-list"><For each={standardFields()}>{(field) => <label class="standard-field-row"><span><strong>{field.label}</strong><small>{field.key} · {field.type}</small></span><span class="standard-field-control"><Show when={field.locked} fallback={<input type="checkbox" checked={enabledStandardFields().has(field.key)} onChange={() => void toggleStandardField(field.key)} />}><span class="badge badge-secondary">{t('settings.customFields.standard.locked')}</span></Show></span></label>}</For></div></section>
      </Show>
    </Show>
  </div>;
}
