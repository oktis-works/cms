/* eslint-disable @typescript-eslint/no-unused-vars */
// @oktis-works/admin - Group Customizer
//
// Campo de grupo (fieldset colapsável com subcampos) para o Theme Customizer.

import { For, Show, createSignal, createMemo } from 'solid-js';
import { useTranslation } from '../../i18n';
import { FieldRendererFactory } from './FieldRendererFactory';

export interface GroupSubField {
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
  subFields?: GroupSubField[];
  layouts?: Array<{ name: string; label?: string; subFields: GroupSubField[] }>;
}

export interface GroupCustomizerProps {
  value: Record<string, unknown> | null | undefined;
  onChange: (value: Record<string, unknown>) => void;
  subFields: GroupSubField[];
  label?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  description?: string;
}

export function GroupCustomizer(props: GroupCustomizerProps) {
  const { t } = useTranslation();
  const {
    value,
    onChange,
    subFields,
    label,
    collapsible = true,
    defaultExpanded = true,
    description,
  } = props;

  const [expanded, setExpanded] = createSignal(defaultExpanded);
  const [data, setData] = createSignal<Record<string, unknown>>(value || {});

  const handleFieldChange = (fieldName: string, fieldValue: unknown) => {
    const next = { ...data(), [fieldName]: fieldValue };
    setData(next);
    onChange(next);
  };

  const toggleExpanded = () => setExpanded((prev) => !prev);

  return (
    <div class="group-customizer">
      <div class="group-customizer__header">
        <label class="group-customizer__label">
          {label || 'Grupo'}
        </label>
        {collapsible && (
          <button
            type="button"
            class="group-customizer__toggle"
            onClick={() => setExpanded((prev) => !prev)}
            aria-label={expanded() ? 'Colapsar' : 'Expandir'}
            aria-expanded={expanded()}
          >
            {expanded() ? '▲' : '▼'}
          </button>
        )}
      </div>
      {description && <p class="group-customizer__description">{description}</p>}

      <Show when={expanded() || !collapsible}>
        <div class="group-customizer__fields">
          <For each={subFields}>
            {(field) => (
              <div class="group-customizer__field">
                <FieldRendererFactory
                  field={{ ...field, name: field.name }}
                  value={data()[field.name]}
                  onChange={(val) => {
                    const next = { ...data(), [field.name]: val };
                    setData(next);
                    onChange(next);
                  }}
                  subFields={field.subFields}
                  layouts={field.layouts}
                />
              </div>
            )}
          </For>
        </div>
      </Show>

      <style>{`
        .group-customizer { border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-white); overflow: hidden; }
        .group-customizer__header { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; background: #f5f5f5; border-bottom: 1px solid var(--color-border); }
        .group-customizer__label { font-weight: 600; font-size: 0.875rem; color: var(--color-text); margin: 0; }
        .group-customizer__toggle { background: none; border: none; font-size: 1rem; cursor: pointer; color: var(--color-muted); padding: 0.25rem; border-radius: var(--radius-sm); transition: color 0.15s; }
        .group-customizer__toggle:hover { color: var(--color-primary); }
        .group-customizer__description { padding: 0.5rem 1rem; margin: 0; font-size: 0.8125rem; color: var(--color-muted); border-bottom: 1px solid var(--color-border); }
        .group-customizer__fields { padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
        .group-customizer__field { display: flex; flex-direction: column; gap: 0.5rem; }
      `}</style>
    </div>
  );
}