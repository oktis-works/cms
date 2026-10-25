// @oktis-works/admin - FieldRendererFactory

import { DateTimeCustomizer, type DateTimeType } from './DateTimeCustomizer';
import { EntitySelectorCustomizer, type EntityType } from './EntitySelectorCustomizer';
import { FlexibleContentCustomizer } from './FlexibleContentCustomizer';
import { GoogleMapCustomizer } from './GoogleMapCustomizer';
import { LinkCustomizer } from './LinkCustomizer';
import { MediaPickerCustomizer } from './MediaPickerCustomizer';
import { RelationshipCustomizer } from './RelationshipCustomizer';
import { RepeaterCustomizer, type RepeaterSubField } from './RepeaterCustomizer';
import { RichTextEditor } from './RichTextEditor';
import { GroupCustomizer, type GroupSubField } from './GroupCustomizer';

export interface ResolvedFieldDefinition {
  name: string;
  type: string;
  label?: string;
  default?: unknown;
  options?: Array<string | { value: string; label: string }>;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  subFields?: ResolvedFieldDefinition[];
  layouts?: FlexibleLayout[];
  postType?: string;
  multiple?: boolean;
  placeholder?: string;
  taxonomy?: string;
  entityType?: EntityType;
  accept?: string;
  itemLabel?: string;
  minRows?: number;
  maxRows?: number;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}
export type CustomFieldConfig = ResolvedFieldDefinition;

export interface FieldRendererComponentProps {
  field: ResolvedFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  subFields?: ResolvedFieldDefinition[];
  layouts?: FlexibleLayout[];
}

export interface FlexibleLayout {
  name: string;
  label?: string;
  subFields: FlexibleSubField[];
}

export interface FlexibleSubField {
  name: string;
  type: string;
  label?: string;
  default?: unknown;
  options?: Array<string | { value: string; label: string }>;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  subFields?: FlexibleSubField[];
  layouts?: FlexibleLayout[];
}

// ============================================================================
// Simple inline field components
// ============================================================================

function SimpleInput(props: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <input type="text" class="input" value={props.value || ''} placeholder={props.placeholder} onInput={(e) => props.onChange(e.currentTarget.value)} />
  );
}

function TextareaInput(props: { field: ResolvedFieldDefinition; value: string; onChange: (value: string) => void }) {
  return (
    <textarea class="input" rows={4} value={props.value || ''} placeholder={props.field.placeholder} onInput={(e) => props.onChange(e.currentTarget.value)} />
  );
}

function NumberInput(props: { field: ResolvedFieldDefinition; value: string | number; onChange: (value: unknown) => void }) {
  return (
    <input type="number" class="input" value={props.value || ''} min={props.field.min} max={props.field.max} step={props.field.step} onInput={(e) => props.onChange(e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value))} />
  );
}

function EmailInput(props: { field: ResolvedFieldDefinition; value: string; onChange: (value: string) => void }) {
  return <input type="email" class="input" value={props.value || ''} placeholder={props.field.placeholder} onInput={(e) => props.onChange(e.currentTarget.value)} />;
}

function UrlInput(props: { field: ResolvedFieldDefinition; value: string; onChange: (value: string) => void }) {
  return <input type="url" class="input" placeholder={props.field.placeholder} value={props.value} onInput={(e) => props.onChange(e.currentTarget.value)} />;
}

function PasswordInput(props: { field: ResolvedFieldDefinition; value: string; onChange: (value: string) => void }) {
  return <input type="password" class="input" value={props.value} onChange={(e) => props.onChange(e.currentTarget.value)} />;
}

function SlugInput(props: { field: ResolvedFieldDefinition; value: string; onChange: (value: string) => void; placeholder?: string }) {
  const slugify = (input: string): string => input.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return (
    <input type="text" class="input" value={props.value} placeholder={props.placeholder} onInput={(e) => props.onChange(slugify(e.currentTarget.value))} onBlur={(e) => props.onChange(slugify(e.currentTarget.value.trim()))} />
  );
}

function ColorInput(props: { value: string; onChange: (value: string) => void }) {
  return <input type="color" class="input" value={props.value} onChange={(e) => props.onChange(e.currentTarget.value)} />;
}

function SelectInput(props: { field: ResolvedFieldDefinition; value: unknown; onChange: (value: unknown) => void }) {
  return (
    <select class="input" value={String(props.value ?? '')} onChange={(e) => props.onChange(e.currentTarget.value)}>
      <option value="">Select an option</option>
      {(props.field.options ?? []).map((option) => {
        const value = typeof option === 'string' ? option : option.value;
        const label = typeof option === 'string' ? option : option.label;
        return <option value={value}>{label}</option>;
      })}
    </select>
  );
}

function CheckboxInput(props: { value: unknown; onChange: (value: boolean) => void }) {
  return <label class="checkbox-label"><input type="checkbox" checked={props.value === true} onChange={(e) => props.onChange(e.currentTarget.checked)} /> Enabled</label>;
}

export function FieldRendererFactory(props: FieldRendererComponentProps) {
  const { field, value, onChange } = props;
  const type = field.type;

  switch (type) {
    case 'text':
      return <SimpleInput value={value as string || ''} onChange={onChange} placeholder={field.placeholder} />;
    case 'textarea':
      return <TextareaInput field={field} value={value as string || ''} onChange={onChange} />;
    case 'number':
    case 'range':
      return <NumberInput field={field} value={value as string | number || ''} onChange={onChange} />;
    case 'email':
      return <EmailInput field={field} value={value as string} onChange={onChange} />;
    case 'url':
      return <UrlInput field={field} value={value as string} onChange={onChange} />;
    case 'password':
      return <PasswordInput field={field} value={value as string} onChange={onChange} />;
    case 'slug':
      return <SlugInput field={field} value={value as string} onChange={onChange} placeholder={field.placeholder} />;
    case 'select':
      return <SelectInput field={field} value={value} onChange={onChange} />;
    case 'checkbox':
    case 'toggle':
      return <CheckboxInput value={value} onChange={onChange} />;
    case 'color':
    case 'color_picker':
      return <ColorInput value={value as string} onChange={onChange} />;
    case 'wysiwyg':
      return <RichTextEditor value={value as string} onChange={onChange} placeholder={field.placeholder} disabled={false} />;
    case 'date_picker':
    case 'date_time_picker':
    case 'time_picker':
      return (
        <DateTimeCustomizer type={type as DateTimeType} value={value as string} onChange={onChange} placeholder={field.placeholder} label={field.label} min={field.min != null ? `${field.min}` : undefined} max={field.max != null ? `${field.max}` : undefined} step={field.step != null ? String(field.step) : undefined} />
      );
    case 'google_map':
      return <GoogleMapCustomizer value={value as { address?: string; lat?: number; lng?: number }} onChange={onChange} placeholder={field.placeholder} label={field.label} />;
    case 'link':
      return <LinkCustomizer value={value as { url: string; target?: string }} onChange={onChange} placeholder={field.placeholder} label={field.label} />;
    case 'relationship':
    case 'post_object':
      return (
        <RelationshipCustomizer value={value as string | string[]} onChange={onChange} postType={field.postType} multiple={field.multiple !== false} placeholder={field.placeholder} label={field.label} />
      );
    case 'image':
    case 'file':
    case 'media':
      return <MediaPickerCustomizer value={value as string | string[]} onChange={onChange} multiple={field.multiple} accept={field.accept} label={field.label} placeholder={field.placeholder} />;
    case 'gallery':
      return <MediaPickerCustomizer value={value as string | string[]} onChange={onChange} multiple accept={field.accept} label={field.label} placeholder={field.placeholder} />;
    case 'group':
      return <GroupCustomizer value={value as Record<string, unknown>} onChange={onChange} subFields={field.subFields as GroupSubField[]} label={field.label} collapsible={field.collapsible} defaultExpanded={field.defaultExpanded} />;
    case 'taxonomy':
    case 'user':
      return (
        <EntitySelectorCustomizer entityType={(field.entityType ?? type) as EntityType} value={value as string | string[]} onChange={onChange} taxonomy={field.taxonomy} multiple={field.multiple !== false} placeholder={field.placeholder} label={field.label} />
      );
    case 'repeater':
      return (
        <RepeaterCustomizer subFields={field.subFields as RepeaterSubField[]} value={value as Record<string, unknown>[]} onChange={onChange} label={field.label} itemLabel={field.itemLabel} minRows={field.minRows} maxRows={field.maxRows} />
      );
    case 'flexible_content':
      return (
        <FlexibleContentCustomizer layouts={field.layouts as FlexibleLayout[]} value={value as Array<{ fc_layout: string; [key: string]: unknown }>} onChange={onChange} label={field.label} minRows={field.minRows} maxRows={field.maxRows} />
      );
    default:
      return (
        <div class="field-renderer__fallback">
          <span>Unsupported field type: {type}</span>
          <SimpleInput value={value as string || ''} onChange={onChange} placeholder={field.placeholder} />
        </div>
      );
  }
}
