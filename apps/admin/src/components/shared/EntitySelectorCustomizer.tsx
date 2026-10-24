// @oktis-works/admin - Entity Selector Customizer
//
// Seletor de entidades (taxonomy, user) para o Theme Customizer.

import { For, Show, createSignal, onMount } from 'solid-js';
import { apiClient } from '../../lib/api';
import { useTranslation } from '../../i18n';

export type EntityType = 'taxonomy' | 'user';

export interface EntitySelectorCustomizerProps {
  value: string | string[] | null | undefined;
  onChange: (value: string | string[]) => void;
  entityType: EntityType;
  taxonomy?: string; // Para taxonomy: qual taxonomia filtrar
  multiple?: boolean;
  placeholder?: string;
  label?: string;
}

export function EntitySelectorCustomizer(props: EntitySelectorCustomizerProps) {
  const { t: _t } = useTranslation();
  const {
    value,
    onChange,
    entityType,
    taxonomy,
    multiple = false,
    placeholder = 'Buscar...',
    label,
  } = props;

  const [items, setItems] = createSignal<Array<{ id: string; name: string; slug?: string }>>([]);
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
      let result;
      
      if (entityType === 'taxonomy') {
        // Buscar termos da taxonomia
        result = await apiClient.listTaxonomyTerms({
          taxonomy: taxonomy || '',
          page: page(),
          limit,
          search: search() || undefined,
        });
      } else {
        // Buscar usuários
        result = await apiClient.listUsers({
          page: page(),
          limit,
          search: search() || undefined,
        });
      }
      
      setItems((result.data ?? []).map((item: any) => ({
        id: item.id,
        name: item.name || item.title || item.slug,
        slug: item.slug,
      })));
      setTotal(result.total ?? 0);
    } catch (err) {
      console.error('Entity load error:', err);
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
    onChange(multiple ? newIds : newIds[0]);
  };

  const _isSelected = (id: string): boolean => selectedIds().includes(id);

  const _clearSelection = (): void => {
    setSelectedIds([]);
    onChange(multiple ? [] : '');
    setShowDropdown(false);
  };

  const formatName = (item: { name?: string; slug?: string }) => item.name || item.slug || item.id;

  return (
    <div class="entity-selector-customizer">
      <label class="entity-selector__label">
        {label || (entityType === 'taxonomy' ? 'Taxonomia' : 'Usuário')}
      </label>
      
      <div class="entity-selector__trigger" onClick={() => { setShowDropdown(!showDropdown()); if (showDropdown()) load(); }}>
        <div class="entity-selector__selected">
          {selectedIds().length > 0 ? (
            <For each={selectedIds()}>
              {(id) => {
                const item = items().find((i) => i.id === id);
                return (
                  <span class="entity-selector__chip" key={id}>
                    {item ? formatName(item) : id}
                    <button
                      type="button"
                      class="entity-selector__chip-remove"
                      onClick={(e) => { e.stopPropagation(); toggleSelect(id); }}
                    >
                      ✕
                    </button>
                  </span>
                );
              }}
            </For>
          ) : (
            <span class="entity-selector__placeholder">{placeholder}</span>
          )}
        </div>
        <span class="entity-selector__arrow">{showDropdown() ? '▲' : '▼'}</span>
      </div>

      <Show when={showDropdown()}>
        <div class="entity-selector__dropdown">
          <div class="entity-selector__search">
            <input
              type="text"
              class="input"
              placeholder={placeholder}
              value={search()}
              onInput={(e) => { setSearch(e.currentTarget.value); setPage(1); load(); }}
              onKeyDown={(e) => e.key === 'Enter' && searchNow()}
              autoFocus
            />
            <button class="btn btn-secondary" onClick={searchNow} disabled={loading}>
              {loading ? 'Carregando...' : 'Buscar'}
            </button>
          </div>
          
          <div class="entity-selector__list">
            <For each={items()}>
              {(item) => (
                <div
                  class="entity-selector__item"
                  classList={{ selected: selectedIds().includes(item.id) }}
                  onClick={() => {
                    const current = selectedIds();
                    if (current.includes(item.id)) {
                      setSelectedIds(current.filter((id) => id !== item.id));
                    } else if (multiple) {
                      setSelectedIds([...current, item.id]);
                    } else {
                      setSelectedIds([item.id]);
                      setShowDropdown(false);
                    }
                    onChange(multiple ? [...current, item.id].filter((v, i, a) => a.indexOf(v) === i) : [item.id]);
                  }}
                  classList={{ selected: selectedIds().includes(item.id) }}
                >
                  <span>{formatName(item)}</span>
                  {item.slug && <span class="entity-selector__item-slug">{item.slug}</span>}
                </div>
              )}
            </For>
            {items().length === 0 && !loading() && (
              <div class="entity-selector__empty">Nenhum resultado encontrado</div>
            )}
          </div>
          
          <Show when={total() > 10}>
            <div class="entity-selector__pagination">
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
        .entity-selector-customizer { position: relative; }
        .entity-selector__label { display: block; font-size: 0.75rem; font-weight: 600; color: var(--color-text); margin-bottom: 0.25rem; }
        .entity-selector__trigger {
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
        .entity-selector__trigger:hover { border-color: var(--color-primary); }
        .entity-selector__selected { display: flex; flex-wrap: wrap; gap: 0.25rem; flex: 1; min-height: 24px; }
        .entity-selector__chip {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.25rem 0.5rem;
          background: var(--color-primary-soft);
          color: var(--color-primary);
          border-radius: var(--radius-full);
          font-size: 0.75rem;
        }
        .entity-selector__chip-remove {
          background: none;
          border: none;
          color: var(--color-primary);
          cursor: pointer;
          padding: 0;
          font-size: 0.75rem;
          line-height: 1;
        }
        .entity-selector__placeholder { color: var(--color-muted); font-size: 0.875rem; }
        .entity-selector__arrow { font-size: 0.75rem; color: var(--color-muted); transition: transform 0.15s; }
        .entity-selector__dropdown {
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
        .entity-selector__search {
          display: flex;
          gap: 0.5rem;
          padding: 0.75rem;
          border-bottom: 1px solid var(--color-border);
        }
        .entity-selector__search input { flex: 1; }
        .entity-selector__list {
          max-height: 300px;
          overflow-y: auto;
        }
        .entity-selector__item {
          padding: 0.5rem 0.75rem;
          cursor: pointer;
          border-bottom: 1px solid var(--color-border);
          transition: background 0.1s;
        }
        .entity-selector__item:hover { background: var(--color-primary-soft); }
        .entity-selector__item.selected { background: var(--color-primary-soft); border-left: 3px solid var(--color-primary); }
        .entity-selector__empty { padding: 1rem; text-align: center; color: var(--color-muted); }
        .entity-selector__pagination { display: flex; align-items: center; justify-content: center; gap: 1rem; padding: 0.75rem; border-top: 1px solid var(--color-border); font-size: 0.8125rem; }
      `}</style>
    </div>
  );
}