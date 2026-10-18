// @oktis-works/admin - FloatingPanel (dropdown em portal, imune a overflow)
//
// Dropdowns ancorados num gatilho ficam limitados pelo `overflow` de qualquer
// ancestral com `overflow: hidden/auto` (formulário, card, lista de drag &
// drop, coluna da grade). Este painel é renderizado num <Portal> no fim do
// <body> com `position: fixed`, medido a cada abertura e reposicionado em
// scroll/resize — nenhum container pai consegue cortá-lo.
//
// Comportamento: abre para baixo; se não couber, abre para cima; a largura é
// a do gatilho (com piso configurável), sempre contida na viewport. Clique
// fora (gatilho + painel contados) e Escape fecham.

import { Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import type { JSX } from 'solid-js';
import { Portal } from 'solid-js/web';

export interface FloatingPanelProps {
  open: boolean;
  /** Elemento-gatilho (botão) — âncora do posicionamento. */
  trigger: HTMLElement | undefined;
  onClose: () => void;
  /** Classe do painel (visual: borda, sombra, padding — posicionamento é inline). */
  class?: string;
  /** Papel ARIA do painel (nossos usos: dialog e listbox). */
  role?: 'dialog' | 'listbox' | 'menu' | 'grid' | 'presentation';
  'aria-label'?: string;
  onKeyDown?: (event: KeyboardEvent) => void;
  /** Largura mínima do painel (default 240px). */
  minWidth?: number;
  children: JSX.Element;
}

const GAP = 4; // folga entre gatilho e painel
const VIEWPORT_MARGIN = 8; // folga mínima em relação às bordas da viewport

export function FloatingPanel(props: FloatingPanelProps) {
  let panel: HTMLDivElement | undefined;
  const [style, setStyle] = createSignal<JSX.CSSProperties>({
    position: 'fixed',
    visibility: 'hidden',
  });

  const reposition = (): void => {
    const trigger = props.trigger;
    if (!trigger || !panel) return;
    const rect = trigger.getBoundingClientRect();

    const panelHeight = panel.offsetHeight;
    const panelWidth = Math.min(
      Math.max(rect.width, props.minWidth ?? 240),
      window.innerWidth - VIEWPORT_MARGIN * 2,
    );

    // Horizontal: alinhado à esquerda do gatilho, contido na viewport.
    const maxLeft = window.innerWidth - panelWidth - VIEWPORT_MARGIN;
    const left = Math.min(Math.max(rect.left, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, maxLeft));

    // Vertical: abre para baixo; sem espaço suficiente, abre para cima.
    const spaceBelow = window.innerHeight - rect.bottom - GAP - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - GAP - VIEWPORT_MARGIN;
    const flip = panelHeight > 0 && panelHeight > spaceBelow && spaceAbove > spaceBelow;
    const rawTop = flip ? rect.top - GAP - panelHeight : rect.bottom + GAP;
    const top = Math.min(Math.max(rawTop, VIEWPORT_MARGIN), window.innerHeight - VIEWPORT_MARGIN);

    setStyle((current) =>
      current.top === `${top}px` &&
      current.left === `${left}px` &&
      current.width === `${panelWidth}px`
        ? current
        : { position: 'fixed', top: `${top}px`, left: `${left}px`, width: `${panelWidth}px`, zIndex: 1600 },
    );
  };

  // Posiciona depois do layout (mede o painel real) e de novo no animation
  // frame, quando o conteúdo terminal (autofocus/imagens) já assentou.
  createEffect(() => {
    if (!props.open) return;
    queueMicrotask(reposition);
    requestAnimationFrame(reposition);
  });

  onMount(() => {
    const onOutside = (event: MouseEvent): void => {
      const target = event.target as Node | null;
      if (!target) return;
      if (props.trigger?.contains(target) || panel?.contains(target)) return;
      props.onClose();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') props.onClose();
    };
    // Capture pega também a rolagem de containers internos (.main-content etc).
    const onScrollOrResize = (): void => reposition();

    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    onCleanup(() => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    });
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class={props.class}
          role={props.role}
          aria-label={props['aria-label']}
          style={style()}
          onKeyDown={props.onKeyDown}
          ref={(element) => {
            panel = element;
            reposition();
          }}
        >
          {props.children}
        </div>
      </Portal>
    </Show>
  );
}
