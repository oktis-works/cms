// Editable model + pure helpers for the field-group builder.
// Lifted/refactored from the previous CustomFieldsManager into a shared module
// so the list screen, editor screen, and sub-field editors all share one model.

import type { FieldDefinition, FieldTypeInfo, LocationRule } from '../../lib/api';

export type LabelPlacement = 'top' | 'left';
export type InstructionPlacement = 'above' | 'below';
export type GroupPosition = 'normal' | 'side' | 'after_title';
export type DisplayStyle = 'standard' | 'seamless' | 'grouped';
export type LayoutDisplay = 'block' | 'table' | 'row';

export interface EditableLayout {
  clientId: string;
  name: string;
  label: string;
  display: LayoutDisplay;
  min?: number;
  max?: number;
  subFields: EditableField[];
}

export interface EditableField {
  clientId: string;
  id?: string;
  key?: string;
  type: string;
  name: string;
  label: string;
  instructions?: string;
  required: boolean;
  config: Record<string, unknown>;
  conditionalLogic: unknown;
  sortOrder?: number;
  subFields: EditableField[];
  layouts: EditableLayout[];
  isCoreField?: boolean;
  isLocked?: boolean;
  coreFieldKey?: string;
}

export interface FieldGroupMetadata {
  description?: string;
  labelPlacement?: LabelPlacement;
  instructionPlacement?: InstructionPlacement;
  menuOrder?: number;
  hideOnScreen?: string[];
  displayTitle?: string;
}

export interface FieldGroupDraft {
  id?: string;
  key?: string;
  title: string;
  position: GroupPosition;
  displayStyle: DisplayStyle;
  active: boolean;
  locationRules: LocationRule[][];
  fields: EditableField[];
  metadata: FieldGroupMetadata;
  createdAt?: string;
  updatedAt?: string;
}

// --- Field-type groupings used to decide which settings a type exposes -------
export const CONTAINER_TYPES = new Set(['group', 'repeater']);
export const CHOICE_TYPES = new Set(['select', 'checkbox', 'radio', 'button_group']);
export const MEDIA_TYPES = new Set(['image', 'file', 'gallery']);
export const RELATION_TYPES = new Set(['post_object', 'relationship', 'page_link', 'taxonomy', 'user']);
export const DATE_TYPES = new Set(['date_picker', 'date_time_picker', 'time_picker']);
export const TEXT_TYPES = new Set(['text', 'textarea', 'email', 'url', 'password', 'slug', 'number', 'range']);
export const LAYOUT_ONLY_TYPES = new Set(['tab', 'accordion', 'message', 'separator']);

export const LOCATION_PARAMS: LocationRule['param'][] = [
  'content_type',
  'content_slug',
  'taxonomy',
  'term',
  'user_role',
  'page_template',
  'post_status',
];

// Field types that can hold sub-fields (repeater + group). `clone` reuses an
// existing group's fields, `flexible_content` uses named layouts.
export function hasSubFields(type: string): boolean {
  return CONTAINER_TYPES.has(type);
}

// --- id generation ----------------------------------------------------------
let sequence = 0;
export function clientId(prefix: string): string {
  sequence += 1;
  const uuid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${uuid}_${sequence}`;
}

// --- Stable keys --------------------------------------------------
export function fieldKeyFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'field';
  return `field_${slug}`;
}

export function groupKeyFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'group';
  return `group_${slug}`;
}

// --- factories --------------------------------------------------------------
export function emptyLocationRule(contentType = ''): LocationRule {
  return { param: 'content_type', operator: 'eq', value: contentType };
}

export function emptyField(label: string, type = 'text', index = 0): EditableField {
  const name = `field_${index + 1}`;
  return {
    clientId: clientId('field'),
    type,
    name,
    label,
    required: false,
    config: {},
    conditionalLogic: null,
    subFields: [],
    layouts: [],
  };
}

export function cloneField(field: EditableField): EditableField {
  return {
    ...field,
    clientId: clientId('field'),
    // A duplicated field is a brand-new field: drop persisted id/key so the
    // backend assigns fresh stable keys instead of overwriting the original.
    id: undefined,
    key: undefined,
    required: Boolean(field.required),
    config: { ...(field.config ?? {}) },
    conditionalLogic: field.conditionalLogic ?? null,
    subFields: (field.subFields ?? []).map(cloneField),
    layouts: (field.layouts ?? []).map((layout) => ({
      ...layout,
      clientId: clientId('layout'),
      subFields: layout.subFields.map(cloneField),
    })),
  };
}

// --- conversions ------------------------------------------------------------
export function toEditableField(field: FieldDefinition): EditableField {
  return {
    clientId: clientId('field'),
    id: field.id,
    key: field.key,
    type: field.type,
    name: field.name,
    label: field.label,
    instructions: field.instructions,
    required: Boolean(field.required),
    config: { ...(field.config ?? {}) },
    conditionalLogic: field.conditionalLogic ?? null,
    sortOrder: field.sortOrder,
    subFields: (field.subFields ?? []).map(toEditableField),
    layouts: (field.layouts ?? []).map((layout) => ({
      clientId: clientId('layout'),
      name: layout.name,
      label: layout.label,
      display: (layout.display as LayoutDisplay) ?? 'block',
      min: layout.min,
      max: layout.max,
      subFields: layout.subFields.map(toEditableField),
    })),
    isCoreField: field.isCoreField,
    isLocked: field.isLocked,
    coreFieldKey: field.coreFieldKey,
  };
}

export interface FieldPayload {
  id?: string;
  key?: string;
  type: string;
  name: string;
  label: string;
  instructions?: string;
  required: boolean;
  config: Record<string, unknown>;
  conditionalLogic?: unknown;
  sortOrder: number;
  subFields: FieldPayload[];
  layouts: Array<{
    name: string;
    label: string;
    display: LayoutDisplay;
    min?: number;
    max?: number;
    sortOrder: number;
    subFields: FieldPayload[];
  }>;
}

export function toPayloadField(field: EditableField, sortOrder: number): FieldPayload {
  return {
    id: field.id,
    key: field.key ?? fieldKeyFromName(field.name),
    type: field.type,
    name: field.name.trim(),
    label: field.label.trim() || field.name.trim(),
    instructions: field.instructions?.trim() || undefined,
    required: field.required,
    config: field.config ?? {},
    conditionalLogic: field.conditionalLogic ?? undefined,
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

// --- location rules ---------------------------------------------------------
export function normalizeLocationRules(value: unknown, fallbackContentType = ''): LocationRule[][] {
  if (Array.isArray(value)) {
    const groups = value
      .filter(Array.isArray)
      .map((group) =>
        (group as unknown[])
          .filter((rule): rule is LocationRule => {
            if (!rule || typeof rule !== 'object') return false;
            const candidate = rule as Record<string, unknown>;
            return typeof candidate['param'] === 'string' && typeof candidate['value'] === 'string';
          })
          .map((rule): LocationRule => ({ param: rule.param, operator: rule.operator === 'neq' ? 'neq' : 'eq', value: rule.value }))
      )
      .filter((group) => group.length > 0);
    if (groups.length > 0) return groups;
  }
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

// --- conditional logic ------------------------------------------------------
export interface ConditionalRule {
  field: string;
  operator: string;
  value?: string;
}
export interface ConditionalGroup {
  match: 'ALL' | 'ANY';
  rules: ConditionalRule[];
}
export interface ConditionalLogic {
  match: 'ALL' | 'ANY';
  groups: ConditionalGroup[];
}

export function readConditional(value: unknown): ConditionalLogic {
  if (!value || typeof value !== 'object') {
    return { match: 'ANY', groups: [{ match: 'ALL', rules: [] }] };
  }
  const raw = value as Record<string, unknown>;
  const groups: ConditionalGroup[] = Array.isArray(raw['groups'])
    ? raw['groups'].filter(Boolean).map((group) => {
        const item = group as Record<string, unknown>;
        const rules: ConditionalRule[] = Array.isArray(item['rules'])
          ? item['rules'].filter(Boolean).map((rule) => {
              const entry = rule as Record<string, unknown>;
              return {
                field: String(entry['field'] ?? ''),
                operator: String(entry['operator'] ?? 'eq'),
                value: entry['value'] === undefined ? undefined : String(entry['value']),
              };
            })
          : [];
        return { match: item['match'] === 'ANY' ? ('ANY' as const) : ('ALL' as const), rules };
      })
    : [];
  return {
    match: raw['match'] === 'ALL' ? 'ALL' : 'ANY',
    groups: groups.length > 0 ? groups : [{ match: 'ALL', rules: [] }],
  };
}

export function hasConditionalRules(value: unknown): boolean {
  return readConditional(value).groups.some((group) => group.rules.length > 0);
}

// --- tree helpers -----------------------------------------------------------
export function updateFieldInList(
  fields: EditableField[],
  id: string,
  patch: Partial<EditableField>
): EditableField[] {
  return fields.map((field) => {
    if (field.clientId === id) return { ...field, ...patch };
    return {
      ...field,
      subFields: updateFieldInList(field.subFields, id, patch),
      layouts: field.layouts.map((layout) => ({
        ...layout,
        subFields: updateFieldInList(layout.subFields, id, patch),
      })),
    };
  });
}

/** Move `fromId` so it sits directly before/after `toId` within a flat list. */
export function moveInList(
  fields: EditableField[],
  fromId: string,
  toId: string,
  position: 'before' | 'after'
): EditableField[] {
  if (fromId === toId) return fields;
  const fromIndex = fields.findIndex((field) => field.clientId === fromId);
  if (fromIndex < 0) return fields;
  const item = fields[fromIndex]!;
  const next = fields.filter((field) => field.clientId !== fromId);
  const toIndex = next.findIndex((field) => field.clientId === toId);
  if (toIndex < 0) return fields;
  const insertAt = position === 'after' ? toIndex + 1 : toIndex;
  next.splice(insertAt, 0, item);
  return next;
}

/** Apply an order array (of clientIds) to a flat list, recursing not needed. */
export function reorderByIds(fields: EditableField[], orderedIds: string[]): EditableField[] {
  const byId = new Map(fields.map((field) => [field.clientId, field]));
  const result: EditableField[] = [];
  for (const id of orderedIds) {
    const field = byId.get(id);
    if (field) {
      result.push(field);
      byId.delete(id);
    }
  }
  // Any leftovers (shouldn't happen) keep their relative order at the end.
  for (const field of fields) {
    if (byId.has(field.clientId)) result.push(field);
  }
  return result;
}

/** Flatten all fields (recursing into sub-fields & flexible layouts) for option lists. */
export function collectFieldOptions(
  fields: EditableField[],
  prefix = ''
): Array<{ value: string; label: string }> {
  const result: Array<{ value: string; label: string }> = [];
  for (const field of fields) {
    const path = prefix ? `${prefix}.${field.name}` : field.name;
    result.push({ value: path, label: `${field.label || field.name} (${path})` });
    result.push(...collectFieldOptions(field.subFields, path));
    for (const layout of field.layouts) {
      result.push(...collectFieldOptions(layout.subFields, `${path}:${layout.name}`));
    }
  }
  return result;
}

export function fieldTypeLabel(field: EditableField, types: FieldTypeInfo[]): string {
  return types.find((type) => type.type === field.type)?.label ?? field.type;
}

export function fieldTypeIcon(field: EditableField, types: FieldTypeInfo[]): string {
  return types.find((type) => type.type === field.type)?.icon ?? 'box';
}

/** Derive a machine `name` from a human label. */
export function nameFromLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeLocationRuleValue(rule: LocationRule): LocationRule {
  return { ...rule, operator: rule.operator === 'neq' ? 'neq' : 'eq', value: String(rule.value ?? '') };
}
