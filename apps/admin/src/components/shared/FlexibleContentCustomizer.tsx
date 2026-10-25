// @oktis-works/admin - Flexible Content Customizer
//
// Field renderer for flexible_content type in the Theme Customizer.
// Allows adding/removing/reordering layouts, each with their own subfields.

import { For, Show, createSignal } from 'solid-js';
import { useTranslation } from '../../i18n';
import { FieldRendererFactory } from './FieldRendererFactory';

export interface FlexibleLayout {
  name: string;
  label?: string;
  subFields: FieldRendererComponentProps[];
}

export interface FlexibleSubField {
  name: string;
  type: string;
  label?: string;
  default?: unknown;
  options?: Array<{ value: string; label: string }>;
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

export interface FlexibleContentCustomizerProps {
  value: Array<{ fc_layout: string; [key: string]: unknown }> | null | undefined;
  onChange: (value: Array<{ fc_layout: string; [key: string]: unknown }>) => void;
  layouts: FlexibleLayout[];
  label?: string;
  minRows?: number;
  maxRows?: number;
}

export function FlexibleContentCustomizer(props: FlexibleContentCustomizerProps) {
  const { t } = useTranslation();
  const {
    value,
    onChange,
    layouts,
    label,
    minRows = 0,
    maxRows,
  } = props;

  const [rows, setRows] = createSignal<
    Array<{ fc_layout: string; [key: string]: unknown }>
  >(value || []);
  const [expanded, setExpanded] = createSignal<Set<number>>(new Set([0]));

  const getLayout = (layoutName: string) =>
    layouts.find((layout) => layout.name === layoutName);

  const addRow = (layoutName: string) => {
    const layout = getLayout(layoutName);
    if (!layout) return;

    const newRow: { [key: string]: unknown; fc_layout: string } = {
      fc_layout: layoutName,
    };
    for (const field of layout.subFields) {
      newRow[field.name] = field.default ?? '';
    }
    setRows([...rows(), newRow]);
  };

  const removeRow = (index: number) => {
    const current = rows();
    if (current.length <= minRows) return;
    const next = current.filter((_, i) => i !== index);
    setRows(next);
    const exp = new Set(expanded());
    exp.delete(index);
    const newExp = new Set<number>();
    exp.forEach((idx) => {
      if (idx > index) newExp.add(idx - 1);
      else if (idx < index) newExp.add(idx);
    });
    setExpanded(newExp);
  };

  const moveRow = (index: number, direction: 'up' | 'down') => {
    const current = rows();
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= current.length) return;
    const next = [...rows()];
    const row = next[index];
    const nextIndexValue = next[newIndex];
    if (row && nextIndexValue) {
      next[index] = nextIndexValue;
      next[newIndex] = row;
    }
    setRows(next);
  };

  const handleFieldChange = (
    rowIndex: number,
    fieldName: string,
    fieldValue: unknown
  ) => {
    const next = [...rows()];
    const row = next[rowIndex];
    if (row) {
      next[rowIndex] = { ...row, [fieldName]: fieldValue };
    }
    setRows(next);
    onChange(next);
  };

  const getRowLabel = (row: Record<string, unknown>, index: number): string => {
    const layoutName = row['fc_layout'] as string;
    const layout = getLayout(layoutName);
    return layout?.label || layoutName || `Layout ${index + 1}`;
  };

  const toggleExpanded = (index: number) => {
    const exp = new Set(expanded());
    if (exp.has(index)) exp.delete(index);
    else exp.add(index);
    setExpanded(newExp);
  };

  const isExpanded = (index: number) => expanded().has(index);

  return (
    <div class="flexible-content-customizer">
      <label class="flexible-content-customizer__label">
        {label || 'Flexible Content'}
      </label>

      <div class="flexible-content-customizer__rows">
        <For each={rows()}>
          {(row, index) => (
            <div
              class="flexible-content-customizer__row"
              classList={{ expanded: expanded().has(index()) }}
            >
              <div class="flexible-content-customizer__row-header">
                <span class="flexible-content-customizer__row-label">
                  {getRowLabel(row, index())}
                </span>
                <span class="flexible-content-customizer__layout-badge">
                  {row.fc_layout as string}
                </span>
                <div class="flexible-content-customizer__row-actions">
                  <button
                    type="button"
                    class="btn btn-icon"
                    onClick={() => toggleExpanded(index())}
                    aria-label={expanded().has(index()) ? 'Collapse' : 'Expand'}
                  >
                    {expanded().has(index()) ? '▲' : '▼'}
                  </button>
                  <button
                    type="button"
                    class="btn btn-icon"
                    onClick={() => moveRow(index(), 'up')}
                    disabled={index() === 0}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    class="btn btn-icon"
                    onClick={() => moveRow(index(), 'down')}
                    disabled={index() === rows().length - 1}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    class="btn btn-icon btn-danger"
                    onClick={() => removeRow(index())}
                    disabled={rows().length <= minRows}
                    aria-label="Remove layout"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <Show when={expanded().has(index())}>
                <div class="flexible-content-customizer__fields">
                  <For each={layout.subFields}>
                    {(field) => (
                      <div class="flexible-content-customizer__field">
                        <FieldRendererFactory
                          field={{ ...field, name: field.name }}
                          value={row[field.name]}
                          onChange={(val) =>
                            handleFieldChange(index(), field.name, val)}
                          subFields={field.subFields}
                          layouts={field.layouts}
                        />
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          )}
        </For>
        {rows().length === 0 && (
          <div class="flexible-content-customizer__empty">
            No layouts added. Choose a layout below to start.
          </div>
        )}
      </div>

      <div class="flexible-content-customizer__layout-picker">
        <span class="flexible-content-customizer__picker-label">
          Add layout:
        </span>
        <div class="flexible-content-customizer__layout-buttons">
          <For each={layouts}>
            {(layout) => (
              <button
                type="button"
                class="btn btn-secondary flexible-content-customizer__layout-btn"
                onClick={() => addRow(layout.name)}
              >
                {layout.label || layout.name}
              </button>
            )}
          </For>
        </div>
      </div>

      <style>{`
        .flexible-content-customizer {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .flexible-content-customizer__label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--color-text);
          margin-bottom: 0.25rem;
        }
        .flexible-content-customizer__rows {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .flexible-content-customizer__row {
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          background: var(--color-white);
          overflow: hidden;
        }
        .flexible-content-customizer__row-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          background: #f5f5f5;
          border-bottom: 1px solid var(--color-border);
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .flexible-content-customizer__row-label {
          font-weight: 500;
          font-size: 0.875rem;
        }
        .flexible-content-customizer__layout-badge {
          font-size: 0.625rem;
          padding: 0.125rem 0.375rem;
          background: var(--color-primary-soft);
          color: var(--color-primary);
          border-radius: var(--radius-full);
          text-transform: uppercase;
        }
        .flexible-content-customizer__row-actions {
          display: flex;
          gap: 0.25rem;
        }
        .flexible-content-customizer__row-actions .btn-icon {
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
          min-width: auto;
        }
        .flexible-content-customizer__fields {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .flexible-content-customizer__field {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .flexible-content-customizer__empty {
          padding: 2rem;
          text-align: center;
          color: var(--color-muted);
        }
        .flexible-content-customizer__layout-picker {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid var(--color-border);
        }
        .flexible-content-customizer__picker-label {
          display: block;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--color-text);
          margin-bottom: 0.5rem;
        }
        .flexible-content-customizer__layout-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .flexible-content-customizer__layout-btn {
          display: flex;
          align-items: center;
          gap: 0.375rem;
        }
      `}</style>
    </div>
  );
}