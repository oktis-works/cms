/* eslint-disable @typescript-eslint/no-unused-vars */
// @oktis-works/admin - Field Renderer Factory
//
// Factory que mapeia tipos de campo para seus componentes renderizadores no Customizer.

import {
  RichTextEditor,
  type RichTextEditorProps,
} from './RichTextEditor';
import { MediaPickerCustomizer } from './MediaPickerCustomizer';
import { LinkCustomizer } from './LinkCustomizer';
import { DateTimeCustomizer, type DateTimeType } from './DateTimeCustomizer';
import { GoogleMapCustomizer } from './GoogleMapCustomizer';
import { RelationshipCustomizer } from './RelationshipCustomizer';
import { EntitySelectorCustomizer, type EntityType } from './EntitySelectorCustomizer';
import { RepeaterCustomizer, type RepeaterSubField } from './RepeaterCustomizer';
import { FlexibleContentCustomizer, type FlexibleLayout } from './FlexibleContentCustomizer';
import { GroupCustomizer, type GroupSubField } from './GroupCustomizer';

// Type para subcampos genéricos
export interface CustomFieldConfig {
  name: string;
  type: string;
  label?: string;
  default?: unknown;
  options?: Array<string | { value: string; label: string }>;
  required?: boolean;
  placeholder?: string;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  conditionalLogic?: any;
  group?: string;
  groupOrder?: number;
  subFields?: CustomFieldConfig[];
  layouts?: Array<{ name: string; label?: string; subFields: CustomFieldConfig[] }>;
  postType?: string;
  multiple?: boolean;
  accept?: string;
  entityType?: 'taxonomy' | 'user';
  taxonomy?: string;
  itemLabel?: string;
  minRows?: number;
  maxRows?: number;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

interface FieldRendererComponentProps {
  field: CustomFieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  subFields?: CustomFieldConfig[];
  layouts?: Array<{ name: string; label?: string; subFields: CustomFieldConfig[] }>;
}

function SimpleInput(props: FieldRendererComponentProps) {
  const { field, value, onChange } = props;
  return (
    <input
      type="text"
      class="input"
      value={value as string || ''}
      placeholder={field.placeholder}
      onInput={(e) => onChange(e.currentTarget.value)}
    />
  );
}

function TextareaInput(props: FieldRendererComponentProps) {
  const { field, value, onChange } = props;
  return (
    <textarea
      class="input"
      rows={4}
      value={value as string || ''}
      placeholder={field.placeholder}
      onInput={(e) => onChange(e.currentTarget.value)}
    />
  );
}

function NumberInput(props: FieldRendererComponentProps) {
  const { field, value, onChange } = props;
  return (
    <input
      type="number"
      class="input"
      value={value as string | number || ''}
      min={field.min}
      max={field.max}
      step={field.step}
      onInput={(e) => onChange(e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value))}
    />
  );
}

function EmailInput(props: FieldRendererComponentProps) {
  const { field, value, onChange } = props;
  return (
    <input
      type="email"
      class="input"
      value={value as string || ''}
      placeholder={field.placeholder}
      onInput={(e) => onChange(e.currentTarget.value)}
    />
  );
}

function UrlInput(props: FieldRendererComponentProps) {
  const { field, value, onChange } = props;
  return (
    <input
      type="url"
      class="input"
      placeholder="https://"
      value={value as string || ''}
      onInput={(e) => onChange(e.currentTarget.value)}
    />
  );
}

function PasswordInput(props: FieldRendererComponentProps) {
  const { field, value, onChange } = props;
  return (
    <input
      type="password"
      class="input"
      value={value as string || ''}
      onInput={(e) => onChange(e.currentTarget.value)}
    />
  );
}

function SlugInput(props: FieldRendererComponentProps) {
  const { field, value, onChange } = props;
  const slugify = (input: string): string => {
    return input
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  };
  return (
    <input
      type="text"
      class="input"
      value={value as string || ''}
      placeholder={field.placeholder}
      onInput={(e) => onChange(slugify(e.currentTarget.value))}
      onBlur={(e) => onChange(slugify(e.currentTarget.value.trim()))}
    />
  );
}

function CheckboxInput(props: FieldRendererComponentProps) {
  const { field, value, onChange } = props;
  return (
    <input
      type="checkbox"
      checked={Boolean(value)}
      onChange={(e) => onChange(e.currentTarget.checked)}
    />
  );
}

function SelectInput(props: FieldRendererComponentProps) {
  const { field, value, onChange } = props;
  const choices = (field.options as Array<{ value: string; label: string }>) || [];
  return (
    <select
      class="input"
      multiple={field.multiple === true}
      value={field.multiple === true
        ? (Array.isArray(value) ? value : [])
        : (value as string || '')}
      onChange={(e) =>
        onChange(
          e.currentTarget.multiple
            ? Array.from(e.currentTarget.selectedOptions).map((option) => option.value)
            : e.currentTarget.value
        )
      }
    >
      {choices.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </select>
  );
}

function RadioInput(props: FieldRendererComponentProps) {
  const { field, value, onChange } = props;
  const choices = (field.options as Array<{ value: string; label: string }>) || [];
  return (
    <div class="field-renderer__choices">
      {choices.map((choice) => (
        <label key={choice.value}>
          <input
            type="radio"
            name={field.name}
            checked={value === choice.value}
            onChange={() => onChange(choice.value)}
          />
          {' '}
          {choice.label}
        </label>
      ))}
    </div>
  );
}

function CheckboxGroupInput(props: FieldRendererComponentProps) {
  const { field, value, onChange } = props;
  const choices = (field.options as Array<{ value: string; label: string }>) || [];
  const current = Array.isArray(value) ? value : value ? [value] : [];
  return (
    <div class="field-renderer__choices">
      {choices.map((choice) => (
        <label key={choice.value}>
          <input
            type="checkbox"
            checked={current.includes(choice.value)}
            onChange={(e) =>
              onChange(
                e.currentTarget.checked
                  ? [...current, choice.value]
                  : current.filter((v) => v !== choice.value)
              )}
            />
          {' '}
          {choice.label}
        </label>
      ))}
    </div>
  );
}

function ColorInput(props: FieldRendererComponentProps) {
  const { field, value, onChange } = props;
  return (
    <input
      type="color"
      class="input"
      value={value as string || '#000000'}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
}

// Export the factory function
export function FieldRendererFactory(props: FieldRendererComponentProps) {
  const { field, value, onChange, subFields, layouts } = props;
  const type = field.type;

  // Basic types
  switch (type) {
    case 'text':
      return <SimpleInput {...props} />;
    case 'textarea':
      return <TextareaInput {...props} />;
    case 'number':
    case 'range':
      return <NumberInput {...props} />;
    case 'email':
      return <EmailInput {...props} />;
    case 'url':
      return <UrlInput {...props} />;
    case 'password':
      return <PasswordInput {...props} />;
    case 'slug':
      return <SlugInput {...props} />;
    case 'checkbox':
      return <CheckboxInput {...props} />;
    case 'select':
      return <SelectInput {...props} />;
    case 'radio':
      return <RadioInput {...props} />;
    case 'checkbox_group':
    case 'checkbox-group':
      return <CheckboxGroupInput {...props} />;
    case 'color':
    case 'color_picker':
      return <ColorInput {...props} />;
    case 'wysiwyg':
      return (
        <RichTextEditor
          value={value as string}
          onChange={onChange}
          placeholder={field.placeholder}
          disabled={false}
        />
      );
    case 'date_picker':
    case 'date_time_picker':
    case 'time_picker':
      return (
        <DateTimeCustomizer
          type={type as DateTimeType}
          value={value as string}
          onChange={onChange}
          placeholder={field.placeholder}
          label={field.label}
          min={field.min as string}
          max={field.max as string}
          step={field.step as string}
        />
      );
    case 'google_map':
      return (
        <GoogleMapCustomizer
          value={value as { address?: string; lat?: number; lng?: number }}
          onChange={onChange}
          placeholder={field.placeholder}
          label={field.label}
        />
      );
    case 'link':
      return (
        <LinkCustomizer
          value={value as { url: string; target?: string }}
          onChange={onChange}
          placeholder={field.placeholder}
          label={field.label}
        />
      );
    case 'relationship':
    case 'post_object':
      return (
        <RelationshipCustomizer
          value={value as string | string[]}
          onChange={onChange}
          postType={field.postType}
          multiple={field.multiple !== false}
          placeholder={field.placeholder}
          label={field.label}
        />
      );
    case 'taxonomy':
    case 'user':
      return (
        <EntitySelectorCustomizer
          entityType={type as EntityType}
          value={value as string | string[]}
          onChange={onChange}
          taxonomy={field.taxonomy}
          multiple={field.multiple !== false}
          placeholder={field.placeholder}
          label={field.label}
        />
      );
    case 'repeater':
      return (
        <RepeaterCustomizer
          subFields={(field.subFields as RepeaterSubField[]) || []}
          value={value as Record<string, unknown>[]}
          onChange={onChange}
          label={field.label}
          itemLabel={field.itemLabel}
          minRows={field.minRows}
          maxRows={field.maxRows}
        />
      );
    case 'flexible_content':
      return (
        <FlexibleContentCustomizer
          layouts={(field.layouts as FlexibleLayout[]) || []}
          value={value as Array<{ fc_layout: string; [key: string]: unknown }>}
          onChange={onChange}
          label={field.label}
          minRows={field.minRows}
          maxRows={field.maxRows}
        />
      );
    case 'group':
      return (
        <GroupCustomizer
          subFields={(field.subFields as GroupSubField[]) || []}
          value={value as Record<string, unknown>}
          onChange={onChange}
          label={field.label}
          collapsible={field.collapsible !== false}
          defaultExpanded={field.defaultExpanded !== false}
          description={field.description}
        />
      );
    default:
      // Fallback para tipos desconhecidos
      return (
        <div class="field-customizer__fallback">
          <span>Tipo de campo não suportado: {type}</span>
          <SimpleInput {...props} />
        </div>
      );
  }
}

// Re-export types for convenience
export type {
  RichTextEditorProps,
  DateTimeType,
  EntityType,
  RepeaterSubField,
  FlexibleLayout,
  GroupSubField,
  CustomFieldConfig,
};