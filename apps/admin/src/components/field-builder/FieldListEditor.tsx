import { Show, createSignal, type JSX } from 'solid-js';
import type { FieldCategoryInfo, FieldTypeInfo } from '../../lib/api';
import { SortableFieldList } from './primitives/SortableFieldList';
import { FbIcon } from './primitives/FbIcon';
import { BrowseFieldsModal } from './BrowseFieldsModal';
import { FieldSettingsEditor } from './FieldSettingsEditor';
import { FlexibleLayoutsEditor } from './FlexibleLayoutsEditor';
import {
  cloneField,
  emptyField,
  fieldTypeIcon,
  fieldTypeLabel,
  hasSubFields,
  type EditableField,
} from './model';

type TFn = (key: string) => string;

interface FieldListEditorProps {
  fields: EditableField[];
  types: FieldTypeInfo[];
  categories: FieldCategoryInfo[];
  t: TFn;
  /** Unique sortable group id for this list instance. */
  listId: string;
  depth: number;
  expandedId: () => string | null;
  setExpandedId: (id: string | null) => void;
  conditionFields: Array<{ value: string; label: string }>;
  onChange: (fields: EditableField[]) => void;
  /** Rendered above the list (e.g. the sub-fields mini header). */
  heading?: JSX.Element;
  isSubField?: boolean;
}

/**
 * Field list: a sortable, expandable table of fields. Each row expands
 * in-place to reveal the tabbed settings editor; container types (group and
 * repeater) embed a nested FieldListEditor for their sub-fields, and
 * flexible_content embeds the layouts editor.
 */
export function FieldListEditor(props: FieldListEditorProps) {
  const { t } = props;
  const [modalOpen, setModalOpen] = createSignal(false);

  const patchField = (id: string, patch: Partial<EditableField>): void => {
    const walk = (fields: EditableField[]): EditableField[] =>
      fields.map((field) =>
        field.clientId === id
          ? { ...field, ...patch }
          : {
              ...field,
              subFields: walk(field.subFields),
              layouts: field.layouts.map((layout) => ({ ...layout, subFields: walk(layout.subFields) })),
            }
      );
    props.onChange(walk(props.fields));
  };

  const duplicate = (field: EditableField): void => {
    const copy = cloneField(field);
    copy.label = `${field.label} ${t('settings.customFields.form.copySuffix')}`;
    copy.name = `${field.name}_copy`;
    const index = props.fields.findIndex((f) => f.clientId === field.clientId);
    const next = [...props.fields];
    next.splice(index + 1, 0, copy);
    props.onChange(next);
    props.setExpandedId(copy.clientId);
  };

  const remove = (field: EditableField): void => {
    props.onChange(props.fields.filter((f) => f.clientId !== field.clientId));
    if (props.expandedId() === field.clientId) props.setExpandedId(null);
  };

  const addField = (type: string, label: string, name: string): void => {
    const field = emptyField(label, type, props.fields.length);
    field.name = name || field.name;
    props.onChange([...props.fields, field]);
    props.setExpandedId(field.clientId);
    setModalOpen(false);
  };

  return (
    <div class="fb-field-list" data-depth={props.depth}>
      <BrowseFieldsModal
        open={modalOpen()}
        types={props.types}
        categories={props.categories}
        t={t}
        onClose={() => setModalOpen(false)}
        onSelect={addField}
      />

      <Show when={props.heading}>{props.heading}</Show>

      <SortableFieldList
        items={props.fields}
        group={props.listId}
        class={props.isSubField ? 'fb-sortable-list fb-sortable-list--sub' : 'fb-sortable-list'}
        handleLabel={t('settings.customFields.form.dragHint')}
        onReorder={props.onChange}
      >
        {(row) => (
          <FieldRow
            field={row.item}
            index={row.index}
            types={props.types}
            categories={props.categories}
            t={t}
            handleRef={row.handleRef}
            expanded={props.expandedId() === row.item.clientId}
            onToggle={() => props.setExpandedId(props.expandedId() === row.item.clientId ? null : row.item.clientId)}
            onPatch={(patch) => patchField(row.item.clientId, patch)}
            onDuplicate={() => duplicate(row.item)}
            onRemove={() => remove(row.item)}
            conditionFields={props.conditionFields}
            subListId={`${props.listId}:${row.item.clientId}`}
            expandedId={props.expandedId}
            setExpandedId={props.setExpandedId}
            onAddSubField={() => setModalOpen(true)}
          />
        )}
      </SortableFieldList>

      <Show when={props.fields.length === 0}>
        <div class="fb-empty-fields">
          <p>{t('settings.customFields.form.noFields')}</p>
        </div>
      </Show>

      <div class="fb-list-footer">
        <button type="button" class="fb-add-field" onClick={() => setModalOpen(true)}>
          + {t('settings.customFields.form.addField')}
        </button>
      </div>
    </div>
  );
}

interface FieldRowProps {
  field: EditableField;
  index: number;
  types: FieldTypeInfo[];
  categories: FieldCategoryInfo[];
  t: TFn;
  handleRef: (el: Element | undefined) => void;
  expanded: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<EditableField>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  conditionFields: Array<{ value: string; label: string }>;
  subListId: string;
  expandedId: () => string | null;
  setExpandedId: (id: string | null) => void;
  onAddSubField: () => void;
}

function FieldRow(props: FieldRowProps) {
  const { t, field } = props;
  const F = (key: string): string => t(`settings.customFields.form.${key}`);
  const icon = () => fieldTypeIcon(field, props.types);

  return (
    <article class="fb-field-row" classList={{ 'is-expanded': props.expanded }}>
      <div class="fb-field-row__header">
        <button
          type="button"
          ref={props.handleRef}
          class="fb-field-row__handle"
          aria-label={F('dragHint')}
          title={F('dragHint')}
        >
          <FbIcon name="grip-vertical" />
        </button>
        <button type="button" class="fb-field-row__toggle" onClick={props.onToggle} aria-expanded={props.expanded}>
          <span class="fb-field-row__order">{props.index + 1}</span>
          <span class="fb-field-row__label">
            <FbIcon name={icon()} class="fb-field-row__type-icon" />
            <strong>{field.label || F('newFieldDefault')}</strong>
          </span>
          <span class="fb-field-row__name">{field.name}</span>
          <span class="fb-field-row__key">{field.key ?? ''}</span>
          <span class="fb-field-row__type">{fieldTypeLabel(field, props.types)}</span>
        </button>
        <div class="fb-field-row__actions">
          <button type="button" class="fb-row-action" onClick={props.onToggle}>{F('editField')}</button>
          <button type="button" class="fb-row-action" onClick={props.onDuplicate}>{F('duplicateField')}</button>
          <button type="button" class="fb-row-action is-danger" onClick={props.onRemove}>{F('removeField')}</button>
        </div>
        <button type="button" class="fb-field-row__chevron" onClick={props.onToggle} aria-label={F('editField')}>
          <FbIcon name={props.expanded ? 'chevron-up' : 'chevron-down'} />
        </button>
      </div>

      <Show when={props.expanded}>
        <div class="fb-field-row__body">
          <FieldSettingsEditor
            field={field}
            types={props.types}
            categories={props.categories}
            conditionFields={props.conditionFields}
            t={t}
            onChange={props.onPatch}
          />

          <Show when={hasSubFields(field.type)}>
            <div class="fb-subfields">
              <div class="fb-subfields__header">
                <h5>{t('settings.customFields.fieldSettings.subFields')}</h5>
              </div>
              <FieldListEditor
                fields={field.subFields}
                types={props.types}
                categories={props.categories}
                t={t}
                listId={props.subListId}
                depth={1}
                isSubField
                expandedId={props.expandedId}
                setExpandedId={props.setExpandedId}
                conditionFields={props.conditionFields}
                onChange={(subFields) => props.onPatch({ subFields })}
              />
            </div>
          </Show>

          <Show when={field.type === 'flexible_content'}>
            <FlexibleLayoutsEditor
              field={field}
              types={props.types}
              categories={props.categories}
              t={t}
              expandedId={props.expandedId}
              setExpandedId={props.setExpandedId}
              conditionFields={props.conditionFields}
              onChange={(patch) => props.onPatch(patch)}
            />
          </Show>
        </div>
      </Show>
    </article>
  );
}
