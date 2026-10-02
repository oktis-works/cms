// @oktis-works/admin - RelationshipPicker (busca assíncrona de conteúdos relacionados)

import { For, Show, createSignal, createMemo } from '@oktis-works/ui';
import { apiClient } from '../../lib/api';

export interface RelationshipPickerProps {
  postType?: string;
  multiple: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
  placeholder?: string;
}

interface ContentOption {
  id: string;
  title: string;
  type: string;
}

export function RelationshipPicker(props: RelationshipPickerProps) {
  const [query, setQuery] = createSignal('');
  const [results, setResults] = createSignal<ContentOption[]>([]);
  const [selected, setSelected] = createSignal<ContentOption[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [open, setOpen] = createSignal(false);

  const selectedIds = createMemo(() => {
    const value = props.value;
    if (Array.isArray(value)) return value.map(String);
    return value ? [String(value)] : [];
  });

  const search = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await apiClient.getContent({
        type: props.postType,
        status: 'PUBLISHED',
        search: query() || undefined,
        limit: 10,
      });
      setResults(
        response.data
          .filter((content) => !selectedIds().includes(content.id))
          .map((content) => ({ id: content.id, title: content.title, type: content.type }))
      );
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const select = (option: ContentOption): void => {
    setSelected((current) => [...current, option]);

    if (props.multiple) {
      props.onChange([...selectedIds(), option.id]);
    } else {
      props.onChange(option.id);
      setQuery('');
    }
    setResults([]);
    setOpen(false);
  };

  const remove = (id: string): void => {
    setSelected((current) => current.filter((entry) => entry.id !== id));
    const next = selectedIds().filter((entry) => entry !== id);
    props.onChange(props.multiple ? next : next[0] ?? null);
  };

  // Pré-carrega opções quando o campo recebe foco
  const onOpen = async (): Promise<void> => {
    if (!open()) await search();
  };

  return (
    <div class="relationship-picker">
      <Show when={selected().length > 0 || selectedIds().length > 0}>
        <ul class="relationship-picker__selection">
          <For each={selected()}>
            {(entry) => (
              <li>
                {entry.title}
                <button type="button" onClick={() => remove(entry.id)} aria-label="Remover">×</button>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <input
        type="search"
        class="input"
        placeholder={props.placeholder ?? 'Buscar conteúdo...'}
        value={query()}
        onFocus={() => void onOpen()}
        onInput={(e) => {
          setQuery(e.currentTarget.value);
          void search();
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />

      <Show when={open() && (loading() || results().length > 0)}>
        <ul class="relationship-picker__results">
          <Show when={loading()}>
            <li class="relationship-picker__empty">Buscando...</li>
          </Show>
          <For each={results()}>
            {(option) => (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(option)}
                >
                  {option.title}
                  <span class="relationship-picker__type">{option.type}</span>
                </button>
              </li>
            )}
          </For>
          <Show when={!loading() && results().length === 0}>
            <li class="relationship-picker__empty">Nenhum resultado</li>
          </Show>
        </ul>
      </Show>
    </div>
  );
}
