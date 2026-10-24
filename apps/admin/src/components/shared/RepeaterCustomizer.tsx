/* eslint-disable @typescript-eslint/no-unused-vars */
// @oktis-works/admin - Repeater Customizer
//
// Campo repetidor para o Theme Customizer (linhas com subcampos).

import { For, Show, createSignal, createMemo } from 'solid-js';
import { useTranslation } from '../../i18n';
import { FieldRendererFactory } from './FieldRendererFactory';

export interface RepeaterSubField {
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
  subFields?: RepeaterSubField[];
  layouts?: Array<{ name: string; label?: string; subFields: RepeaterSubField[] }>;
}

export interface RepeaterCustomizerProps {
  value: Record<string, unknown>[] | null | undefined;
  onChange: (value: Record<string, unknown>[]) => void;
  subFields: RepeaterSubField[];
  label?: string;
  itemLabel?: string; // Campo usado como label da linha (ex: 'title')
  minRows?: number;
  maxRows?: number;
}

export function RepeaterCustomizer(props: RepeaterCustomizerProps) {
  const { t } = useTranslation();
  const {
    value,
    onChange,
    subFields,
    label,
    itemLabel = 'title',
    minRows = 0,
    maxRows,
  } = props;

  const [rows, setRows] = createSignal<Record<string, unknown>[]>(value || []);
  const [expanded, setExpanded] = createSignal<Set<number>>(new Set([0]));

  const addRow = () => {
    const newRow: Record<string, unknown> = {};
    for (const field of subFields) {
      newRow[field.name] = field.default ?? '';
    }
    setRows([...rows(), newRow]);
  };

  const removeRow = (index: number) => {
    const current = rows();
    if (current.length <= minRows) return;
    const next = current.filter((_, i) => i !== index);
    setRows(next);
    // Update expanded
    const exp = new Set(expanded());
    exp.delete(index);
    // Re-index expanded
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
    const next = [...current];
    const item1 = next[index];
    const item2 = next[newIndex];
    if (item1 !== undefined && item2 !== undefined) {
      next[index] = item2;
      next[newIndex] = item1;
      setRows(next);
      // Update expanded
      const exp = new Set(expanded());
      const newExp = new Set<number>();
      exp.forEach((idx) => {
        if (idx === index) newExp.add(newIndex);
        else if (idx === newIndex) newExp.add(index);
        else newExp.add(idx);
      });
      setExpanded(newExp);
    }
  };

  const handleFieldChange = (rowIndex: number, fieldName: string, fieldValue: unknown) => {
    const next = [...rows()];
    next[rowIndex] = { ...next[rowIndex], [fieldName]: fieldValue };
    setRows(next);
    onChange(next);
  };

  const getRowLabel = (row: Record<string, unknown>, index: number): string => {
    const labelValue = row[itemLabel];
    if (labelValue && typeof labelValue === 'string' && labelValue.trim()) {
      return labelValue.trim();
    }
    return `Item ${index + 1}`;
  };

  const toggleExpanded = (index: number) => {
    const exp = new Set(expanded());
    if (exp.has(index)) exp.delete(index);
    else exp.add(index);
    setExpanded(exp);
  };

  const isExpanded = (index: number) => expanded().has(index);

  return (
    <div class="repeater-customizer">
      <label class="repeater-customizer__label">
        {label || 'Repetidor'}
      </label>

      <div class="repeater-customizer__rows">
        <For each={rows()}>
          {(row, index) => (
            <div class="repeater-customizer__row" classList={{ expanded: isExpanded(index()) }}>
              <div class="repeater-customizer__row-header">
                <span class="repeater-customizer__row-label">
                  {getRowLabel(row, index())}
                </span>
                <div class="repeater-customizer__row-actions">
                  <button
                    type="button"
                    class="btn btn-icon"
                    onClick={() => toggleExpanded(index())}
                    aria-label={isExpanded(index()) ? 'Colapsar' : 'Expandir'}
                  >
                    {isExpanded(index()) ? '▲' : '▼'}
                  </button>
                  <button
                    type="button"
                    class="btn btn-icon"
                    onClick={() => moveRow(index(), 'up')}
                    disabled={index() === 0}
                    aria-label="Mover para cima"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    class="btn btn-icon"
                    onClick={() => moveRow(index(), 'down')}
                    disabled={index() === rows().length - 1}
                    aria-label="Mover para baixo"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    class="btn btn-icon btn-danger"
                    onClick={() => removeRow(index())}
                    disabled={rows().length <= minRows}
                    aria-label="Remover linha"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <Show when={isExpanded(index())}>
                <div class="repeater-customizer__fields">
                  <For each={subFields}>
                    {(field) => (
                      <div class="repeater-customizer__field">
                        <FieldRendererFactory
                          field={{ ...field, name: field.name }}
                          value={row[field.name]}
                          onChange={(val) => handleFieldChange(index(), field.name, val)}
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
          <div class="repeater-customizer__empty">
            Nenhuma linha adicionada. Clique em "Adicionar linha" para começar.
          </div>
        )}
      </div>

      <div class="repeater-customizer__actions">
        <button type="button" class="btn btn-primary" onClick={addRow}>
          + {t('customizer.fieldTypes.repeater.addRow', { default: 'Adicionar linha' })}
        </button>
      </div>

      <style>{`
        .repeater-customizer { display: flex; flex-direction: column; gap: 0.5rem; }
        .repeater-customizer__label { font-size: 0.75rem; font-weight: 600; color: var(--color-text); margin-bottom: 0.25rem; }
        .repeater-customizer__rows { display: flex; flex-direction: column; gap: 0.5rem; }
        .repeater-customizer__row {
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          background: var(--color-white);
          overflow: hidden;
        }
        .repeater-customizer__row-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          background: #f5f5f5;
          border-bottom: 1px solid var(--color-border);
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .repeater-customizer__row-label { font-weight: 500; font-size: 0.875rem; }
        .repeater-customizer__row-actions { display: flex; gap: 0.25rem; }
        .repeater-customizer__row-actions .btn-icon {
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
          min-width: auto;
        }
        .repeater-customizer__fields { padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
        .repeater-customizer__field { display: flex; flex-direction: column; gap: 0.5rem; }
        .repeater-customizer__empty { padding: 2rem; text-align: center; color: var(--color-muted); }
        .repeater-customizer__actions { display: flex; justify-content: flex-end; margin-top: 0.5rem; }
      `}</style>
    </div>
  );
}