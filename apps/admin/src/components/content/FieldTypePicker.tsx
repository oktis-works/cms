// @oktis-works/admin - FieldTypePicker (dropdown agrupado por categoria com ícones)

import { For, Show, createSignal, onMount } from 'solid-js';
import { createIcons, icons } from 'lucide';
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

  const refreshIcons = (): void => {
    queueMicrotask(() => createIcons({ icons }));
  };

  onMount(refreshIcons);

  return (
    <div class="field-type-picker">
      <button
        type="button"
        class="field-type-picker__trigger"
        onClick={() => {
          setOpen(!open());
          refreshIcons();
        }}
        aria-expanded={open()}
      >
        <span class="field-type-picker__selected">
          <i data-lucide={selected()?.icon ?? 'box'} aria-hidden="true"></i>
          {selected()?.label ?? 'Selecione o tipo'}
        </span>
        <span aria-hidden="true">{open() ? '▴' : '▾'}</span>
      </button>

      <Show when={open()}>
        <div class="field-type-picker__panel" role="listbox">
          <input
            type="search"
            class="field-type-picker__search"
            placeholder="Buscar tipo de campo..."
            value={query()}
            onInput={(e) => {
              setQuery(e.currentTarget.value);
              refreshIcons();
            }}
          />

          <For each={props.categories}>
            {(category) => {
              const categoryTypes = filteredTypes().filter((type) => type.category === category.id);
              return (
                <Show when={categoryTypes.length > 0}>
                  <div class="field-type-picker__group">
                    <div class="field-type-picker__group-label">
                      <i data-lucide={category.icon} aria-hidden="true"></i>
                      {category.label}
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
                            refreshIcons();
                          }}
                        >
                          <i data-lucide={type.icon} aria-hidden="true"></i>
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
