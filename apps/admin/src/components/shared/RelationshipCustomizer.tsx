/* eslint-disable @typescript-eslint/no-unused-vars */
// @oktis-works/admin - Relationship Customizer
//
// Seletor de relacionamento (post_object, relationship) para o Theme Customizer.

import { For, Show, createSignal, onMount } from 'solid-js';
import { apiClient, type Content } from '../../lib/api';
import { useTranslation } from '../../i18n';

export interface RelationshipCustomizerProps {
  value: string | string[] | null | undefined;
  onChange: (value: string | string[]) => void;
  postType?: string;
  multiple?: boolean;
  placeholder?: string;
  label?: string;
}

export function RelationshipCustomizer(props: RelationshipCustomizerProps) {
  const { t } = useTranslation();
  const {
    value,
    onChange,
    postType,
    multiple = false,
    placeholder = 'Buscar conteúdo...',
    label,
  } = props;

  const [items, setItems] = createSignal<Content[]>([]);
  const [total, setTotal] = createSignal(0);
  const [page, setPage] = createSignal(1);
  const [search, setSearch] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [showDropdown, setShowDropdown] = createSignal(false);
  const [selectedIds, setSelectedIds] = createSignal<string[]>([]);

  const limit = 10;

  const currentIds = Array.isArray(value) ? value : value ? [value] : [];
  onMount(() => {
    setSelectedIds(currentIds);
  });

  const load = async (): Promise<void> => {
    try {
      setLoading(true);
      const result = await apiClient.getContent({
        page: page(),
        limit,
        search: search() || undefined,
        type: postType,
        status: 'PUBLISHED',
      });
      setItems(result.data ?? []);
      setTotal(result.total ?? 0);
    } catch (err) {
      console.error('Relationship load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const searchNow = async (): Promise<void> => {
    setPage(1);
    await load();
  };

  const toggleSelect = (id: string): void => {
    const current = selectedIds();
    if (current.includes(id)) {
      setSelectedIds(current.filter((itemId) => itemId !== id));
    } else if (multiple) {
      setSelectedIds([...current, id]);
    } else {
      setSelectedIds([id]);
      setShowDropdown(false);
    }
    const newIds = multiple
      ? current.includes(id)
        ? current.filter((itemId) => itemId !== id)
        : [...current, id]
      : [id];
    onChange(multiple ? newIds : (newIds[0] as string));
  };

  const isSelected = (id: string): boolean => selectedIds().includes(id);

  const clearSelection = (): void => {
    setSelectedIds([]);
    onChange(multiple ? [] : '');
    setShowDropdown(false);
  };

  return (
    <div class="relationship-customizer">
      <label class="relationship-customizer__label">
        {label || t('customizer.fieldTypes.relationship.label')}
      </label>
      
      <div class="relationship-customizer__trigger" onClick={() => { setShowDropdown(!showDropdown()); if (showDropdown()) load(); }}>
        <div class="relationship-customizer__selected">
          {selectedIds().length > 0 ? (
            <For each={selectedIds()}>
              {(id) => {
                const item = items().find((i) => i.id === id);
                return (
                  <span class="relationship-customizer__chip">
                    {item?.title || id}
                    <button
                      type="button"
                      class="relationship-customizer__chip-remove"
                      onClick={(e) => { e.stopPropagation(); toggleSelect(id); }}
                    >
                      ✕
                    </button>
                  </span>
                );
              }}
            </For>
          ) : (
            <span class="relationship-customizer__placeholder">{placeholder}</span>
          )}
        </div>
        <span class="relationship-customizer__arrow">{showDropdown() ? '▲' : '▼'}</span>
      </div>

      <Show when={showDropdown()}>
        <div class="relationship-customizer__dropdown">
          <div class="relationship-customizer__search">
            <input
              type="text"
              class="input"
              placeholder={placeholder}
              value={search()}
              onInput={(e) => { setSearch(e.currentTarget.value); setPage(1); load(); }}
              onKeyDown={(e) => e.key === 'Enter' && searchNow()}
              autofocus
            />
            <button class="btn btn-secondary" onClick={searchNow} disabled={loading()}>
              {loading() ? 'Carregando...' : 'Buscar'}
            </button>
          </div>
          
          <div class="relationship-customizer__list">
            <For each={items()}>
              {(item) => (
                <div
                  class="relationship-customizer__item"
                  classList={{ selected: isSelected(item.id) }}
                  onClick={() => toggleSelect(item.id)}
                >
                  <div class="relationship-customizer__item-title">{item.title}</div>
                  <div class="relationship-customizer__item-meta">
                    {item.type} · {item.status} · {item.slug}
                  </div>
                </div>
              )}
            </For>
            {items().length === 0 && !loading() && (
              <div class="relationship-customizer__empty">
                {total() === 0 ? 'Nenhum conteúdo encontrado' : 'Nenhum resultado para a busca'}
              </div>
            )}
          </div>
          
          <Show when={total() > 10}>
            <div class="relationship-customizer__pagination">
              <button
                class="btn btn-secondary"
                onClick={() => { setPage(page() - 1); load(); }}
                disabled={page() <= 1}
              >
                ← Anterior
              </button>
              <span>Página {page()} de {Math.ceil(total() / 10)}</span>
              <button
                class="btn btn-secondary"
                onClick={() => { setPage(page() + 1); load(); }}
                disabled={page() >= Math.ceil(total() / 10)}
              >
                Próxima →
              </button>
            </div>
          </Show>
        </div>
      </Show>

      <style>{`
        .relationship-customizer { position: relative; }
        .relationship-customizer__label { display: block; font-size: 0.75rem; font-weight: 600; color: var(--color-text); margin-bottom: 0.25rem; }
        .relationship-customizer__trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0.75rem;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          background: var(--color-white);
          cursor: pointer;
          min-height: 42px;
          transition: border-color 0.15s;
        }
        .relationship-customizer__trigger:hover { border-color: var(--color-primary); }
        .relationship-customizer__selected { display: flex; flex-wrap: wrap; gap: 0.25rem; flex: 1; min-height: 24px; }
        .relationship-customizer__chip {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.25rem 0.5rem;
          background: var(--color-primary-soft);
          color: var(--color-primary);
          border-radius: var(--radius-full);
          font-size: 0.75rem;
        }
        .relationship-customizer__chip-remove {
          background: none;
          border: none;
          color: var(--color-primary);
          cursor: pointer;
          padding: 0;
          font-size: 0.75rem;
          line-height: 1;
        }
        .relationship-customizer__placeholder { color: var(--color-muted); font-size: 0.875rem; }
        .relationship-customizer__arrow { font-size: 0.75rem; color: var(--color-muted); transition: transform 0.15s; }
        .relationship-customizer__dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: var(--color-white);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-lg);
          margin-top: 0.25rem;
          z-index: 100;
          max-height: 500px;
          display: flex;
          flex-direction: column;
        }
        .relationship-customizer__search {
          display: flex;
          gap: 0.5rem;
          padding: 0.75rem;
          border-bottom: 1px solid var(--color-border);
        }
        .relationship-customizer__search input { flex: 1; }
        .relationship-customizer__list {
          max-height: 300px;
          overflow-y: auto;
        }
        .relationship-customizer__item {
          padding: 0.5rem 0.75rem;
          cursor: pointer;
          border-bottom: 1px solid var(--color-border);
          transition: background 0.1s;
        }
        .relationship-customizer__item:hover { background: var(--color-primary-soft); }
        .relationship-customizer__item.selected { background: var(--color-primary-soft); border-left: 3px solid var(--color-primary); }
        .relationship-customizer__item-title { font-weight: 500; font-size: 0.875rem; }
        .relationship-customizer__item-meta { font-size: 0.75rem; color: var(--color-muted); margin-top: 0.125rem; }
        .relationship-customizer__empty { padding: 1rem; text-align: center; color: var(--color-muted); }
        .relationship-customizer__pagination { display: flex; align-items: center; justify-content: center; gap: 1rem; padding: 0.75rem; border-top: 1px solid var(--color-border); font-size: 0.8125rem; }
      `}</style>
    </div>
  );
}