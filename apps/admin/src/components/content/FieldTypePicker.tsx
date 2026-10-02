// @oktis-works/admin - FieldTypePicker (dropdown agrupado por categoria com ícones)

import { For, Show, createSignal } from 'solid-js';
import type { FieldCategoryInfo, FieldTypeInfo } from '../../lib/api';

export interface FieldTypePickerProps {
  categories: FieldCategoryInfo[];
  types: FieldTypeInfo[];
  value: string;
  onChange: (type: string) => void;
}

export function FieldTypePicker(props: FieldTypePickerProps) {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal('');

  const selected = () => props.types.find((type) => type.type === props.value);

  const filteredTypes = () => {
    const q = query().toLowerCase();
    return q
      ? props.types.filter((type) => type.label.toLowerCase().includes(q) || type.type.includes(q))
      : props.types;
  };

  return (
    <div class="field-type-picker">
      <button
        type="button"
        class="field-type-picker__trigger"
        onClick={() => setOpen(!open())}
        aria-expanded={open()}
      >
        <span>{selected()?.icon ?? ' '} {selected()?.label ?? 'Selecione o tipo'}</span>
        <span aria-hidden="true">{open() ? '▴' : '▾'}</span>
      </button>

      <Show when={open()}>
        <div class="field-type-picker__panel" role="listbox">
          <input
            type="search"
            class="field-type-picker__search"
            placeholder="Buscar tipo de campo..."
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />

          <For each={props.categories}>
            {(category) => {
              const categoryTypes = filteredTypes().filter((type) => type.category === category.id);
              return (
                <Show when={categoryTypes.length > 0}>
                  <div class="field-type-picker__group">
                    <div class="field-type-picker__group-label">
                      {category.icon} {category.label}
                    </div>
                    <For each={categoryTypes}>
                      {(type) => (
                        <button
                          type="button"
                          role="option"
                          aria-selected={props.value === type.type}
                          classList={{
                            'field-type-picker__option': true,
                            'is-selected': props.value === type.type,
                          }}
                          onClick={() => {
                            props.onChange(type.type);
                            setOpen(false);
                            setQuery('');
                          }}
                        >
                          <span>{type.icon}</span>
                          <span>{type.label}</span>
                          <Show when={!type.supportsConditions}>
                            <span class="field-type-picker__hint">sem lógica condicional</span>
                          </Show>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
