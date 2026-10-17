// @oktis-works/admin - IconPicker (dropdown com preview dos ícones Lucide)
//
// O catálogo do Lucide traz ~2.100 entradas (ícones + aliases). Duas decisões
// mantêm o dropdown fluido mesmo mostrando o catálogo COMPLETO:
//
// 1. Virtualização (windowing): o painel renderiza só as linhas visíveis mais
//    um overscan (~54 células). O resto nunca vira DOM — abrir, rolar e buscar
//    custam o mesmo com 20 ou 2.100 ícones.
// 2. SVG como string em cache: o preview é `<svg>` via innerHTML, gerado uma
//    vez por ícone e reaproveitado — nada de 2.1k componentes/nós reativos.
//
// O valor salvo continua sendo o nome kebab-case ("shopping-bag"), o mesmo que
// a sidebar injeta em `data-lucide` (DashboardLayout) e que `createIcons()`
// resolve no client.

import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { icons } from 'lucide';

export interface IconPickerProps {
  /** Nome kebab-case salvo (ex.: "shopping-bag"). */
  value: string;
  onChange: (value: string) => void;
  /** Texto do campo de busca. */
  searchPlaceholder?: string;
  /** Mensagem quando a busca não encontra nada. */
  emptyLabel?: string;
  /** Recebe o nº de ícones do filtro para o rodapé ("{count} ícones"). */
  countLabel?: (count: number) => string;
  /** aria-label do painel (acessibilidade). */
  label?: string;
}

/* === Constantes de layout (px) — base do cálculo de janela === */
const CELL_W = 56; // largura-alvo de uma célula (define nº de colunas)
const ROW_H = 60; // altura da linha (célula 56 + gap 4)
const VIEW_H = 300; // altura do viewport rolável
const OVERSCAN = 2; // linhas extras acima/abaixo da janela visível
const ROWS_IN_WINDOW = Math.ceil(VIEW_H / ROW_H) + OVERSCAN * 2;

const toPascal = (name: string): string =>
  name.replace(/(^|[-_])(\w)/g, (_match, _sep, char: string) => char.toUpperCase());

/** "AArrowDown" → "a-arrow-down" (o formato que a sidebar salva em menuIcon). */
const toKebab = (pascal: string): string =>
  pascal
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();

/** Os mesmos atributos que `createIcons()` aplica ao substituir o nó. */
const SVG_DEFAULTS =
  'xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" ' +
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const attrsMarkup = (attrs: object): string =>
  Object.entries(attrs)
    .map(([key, value]) => `${key}="${String(value).replace(/"/g, '&quot;')}"`)
    .join(' ');

/** Catálogo lazy: só nomes kebab ordenados, montado uma única vez. */
let catalogCache: string[] | null = null;
const getCatalog = (): string[] => {
  // Set remove aliases que colidem no kebab (ex.: dois nomes PascalCase que
  // viram o mesmo nome salvo) — senão a grade mostraria a célula duplicada.
  if (!catalogCache) catalogCache = [...new Set(Object.keys(icons).map(toKebab))].sort();
  return catalogCache;
};

/** SVG por nome, gerado uma vez e cacheado (nós desconhecidos → ''). */
const markupCache = new Map<string, string>();

/** Preview de um ícone Lucide — usado pelo picker e pela tabela de tipos. */
export function iconMarkup(name: string): string {
  const hit = markupCache.get(name);
  if (hit !== undefined) return hit;

  const node = icons[toPascal(name) as keyof typeof icons];
  let markup = '';
  if (Array.isArray(node)) {
    const children = node
      .map(([tag, attrs]) => `<${tag} ${attrsMarkup(attrs as object)} />`)
      .join('');
    markup = `<svg ${SVG_DEFAULTS}>${children}</svg>`;
  }
  markupCache.set(name, markup);
  return markup;
}

/** Normaliza para busca: sem caixa, "-"/"_" viram espaço ("shopping bag"). */
const normalize = (text: string): string => text.toLowerCase().replace(/[-_\s]+/g, ' ').trim();

interface Cell {
  name: string;
  index: number;
  row: number;
  col: number;
}

export function IconPicker(props: IconPickerProps) {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal('');
  const [active, setActive] = createSignal(-1); // índice do teclado no filtro
  const [scrollTop, setScrollTop] = createSignal(0);
  const [cols, setCols] = createSignal(6); // 6 até o ResizeObserver medir de verdade
  const [gridEl, setGridEl] = createSignal<HTMLDivElement | undefined>(undefined);

  let root: HTMLDivElement | undefined;
  let scroller: HTMLDivElement | undefined;
  let searchInput: HTMLInputElement | undefined;
  let observer: ResizeObserver | undefined;

  const filtered = createMemo((): string[] => {
    const tokens = normalize(query()).split(' ').filter(Boolean);
    const list = getCatalog();
    if (tokens.length === 0) return list;
    return list.filter((name) => {
      const haystack = normalize(name);
      return tokens.every((token) => haystack.includes(token));
    });
  });

  // Posição (linha/coluna) de cada item do filtro — criada por troca de filtro
  // ou de colunas, nunca por scroll (mantém o <For> estável por identidade).
  const cells = createMemo((): Cell[] => {
    const columnCount = Math.max(1, cols());
    return filtered().map((name, index) => ({
      name,
      index,
      row: Math.floor(index / columnCount),
      col: index % columnCount,
    }));
  });

  const startIndex = createMemo(
    () => Math.max(0, Math.floor(scrollTop() / ROW_H) - OVERSCAN) * cols(),
  );

  // Única parte que toca o DOM por scroll event: a fatia da janela.
  const visibleCells = createMemo((): Cell[] => {
    const start = startIndex();
    return cells().slice(start, start + ROWS_IN_WINDOW * cols());
  });

  const totalRows = createMemo(() => Math.ceil(cells().length / Math.max(1, cols())));

  const measure = (element: HTMLElement | undefined): void => {
    const width = element?.clientWidth ?? 0;
    if (width <= 0) return;
    const columnCount = Math.max(3, Math.floor(width / CELL_W));
    setCols((current) => (current === columnCount ? current : columnCount));
  };

  /** Garante que a linha do índice esteja dentro do viewport rolável. */
  const revealIndex = (index: number, mode: 'nearest' | 'center' = 'nearest'): void => {
    const element = scroller;
    if (!element || index < 0) return;
    const columnCount = Math.max(1, cols());
    const rowTop = Math.floor(index / columnCount) * ROW_H;
    const rowBottom = rowTop + ROW_H;
    let target = element.scrollTop;
    if (mode === 'center') {
      target = rowTop - VIEW_H / 2 + ROW_H / 2;
    } else if (rowTop < element.scrollTop) {
      target = rowTop;
    } else if (rowBottom > element.scrollTop + VIEW_H) {
      target = rowBottom - VIEW_H;
    }
    const max = Math.max(0, totalRows() * ROW_H - VIEW_H);
    target = Math.min(Math.max(0, target), max);
    element.scrollTop = target;
    setScrollTop(target);
  };

  const select = (name: string): void => {
    props.onChange(name);
    setOpen(false);
    setQuery('');
  };

  const moveActive = (delta: number): void => {
    const list = filtered();
    if (list.length === 0) return;
    const current = active();
    // Sem item ativo, a primeira seta parte da borda (para baixo → 0º item).
    const base = current < 0 ? (delta > 0 ? -1 : list.length) : current;
    const next = Math.min(Math.max(0, base + delta), list.length - 1);
    setActive(next);
    revealIndex(next);
  };

  const onPanelKeyDown = (event: KeyboardEvent): void => {
    const columnCount = Math.max(1, cols());
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveActive(columnCount);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveActive(-columnCount);
        break;
      case 'ArrowRight':
        event.preventDefault();
        moveActive(1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        moveActive(-1);
        break;
      case 'Home':
        event.preventDefault();
        setActive(0);
        revealIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActive(filtered().length - 1);
        revealIndex(filtered().length - 1);
        break;
      case 'Enter': {
        // Enter escolhe o item ativo; sem item ativo não pode submeter o form.
        event.preventDefault();
        const current = filtered()[active()];
        if (current) select(current);
        break;
      }
      default:
        break;
    }
  };

  onMount(() => {
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries) => {
        measure(entries[0]?.target as HTMLElement | undefined);
      });
    }
    measure(gridEl());

    const closeOnOutside = (event: MouseEvent): void => {
      if (root && !root.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    onCleanup(() => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
      observer?.disconnect();
    });
  });

  // Mede o grid assim que o painel abre (e reobserva, pois o nó é novo).
  createEffect(() => {
    const element = gridEl();
    if (!element) return;
    measure(element);
    observer?.observe(element);
  });

  // Foco + rolagem até o ícone atual quando o painel abre. Tudo dentro do
  // microtask: fora do escopo reativo, então digitar na busca NÃO re-executa
  // (senão a rolagem brigarra com o usuário a cada tecla).
  createEffect(() => {
    if (!open()) return;
    setActive(-1);
    queueMicrotask(() => {
      const index = filtered().indexOf(props.value);
      if (index >= 0) revealIndex(index, 'center');
      searchInput?.focus();
    });
  });

  // Busca nova = topo da lista.
  createEffect(() => {
    query();
    setActive(-1);
    if (scroller) scroller.scrollTop = 0;
    setScrollTop(0);
  });

  return (
    <div class="icon-picker" ref={root}>
      <button
        type="button"
        class="input icon-picker__trigger"
        aria-haspopup="dialog"
        aria-expanded={open()}
        onClick={() => setOpen(!open())}
      >
        <span class="icon-picker__value">
          <span class="icon-picker__preview" aria-hidden="true" innerHTML={iconMarkup(props.value || 'box')} />
          <span class="icon-picker__name">{props.value || 'box'}</span>
        </span>
        <span class="icon-picker__caret" aria-hidden="true">{open() ? '▴' : '▾'}</span>
      </button>

      <Show when={open()}>
        <div class="icon-picker__panel" role="dialog" aria-label={props.label} onKeyDown={onPanelKeyDown}>
          <input
            type="search"
            class="input icon-picker__search"
            placeholder={props.searchPlaceholder}
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
            ref={(element) => (searchInput = element)}
          />

          <Show
            when={filtered().length > 0}
            fallback={<p class="icon-picker__empty">{props.emptyLabel ?? '—'}</p>}
          >
            <div
              class="icon-picker__viewport"
              ref={(element) => (scroller = element)}
              onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            >
              <div
                class="icon-picker__grid"
                role="listbox"
                aria-label={props.label}
                style={{ height: `${totalRows() * ROW_H}px` }}
                ref={setGridEl}
              >
                <For each={visibleCells()}>
                  {(cell) => (
                    <button
                      type="button"
                      role="option"
                      title={cell.name}
                      aria-label={cell.name}
                      aria-selected={props.value === cell.name}
                      class="icon-picker__cell"
                      classList={{
                        'is-selected': props.value === cell.name,
                        'is-active': active() === cell.index,
                      }}
                      style={{
                        top: `${cell.row * ROW_H}px`,
                        left: `${cell.col * (100 / Math.max(1, cols()))}%`,
                        width: `${100 / Math.max(1, cols())}%`,
                        height: `${ROW_H - 4}px`,
                      }}
                      onClick={() => select(cell.name)}
                      innerHTML={iconMarkup(cell.name)}
                    />
                  )}
                </For>
              </div>
            </div>
          </Show>

          <Show when={props.countLabel && filtered().length > 0}>
            <p class="icon-picker__count">{props.countLabel?.(filtered().length)}</p>
          </Show>
        </div>
      </Show>
    </div>
  );
}
