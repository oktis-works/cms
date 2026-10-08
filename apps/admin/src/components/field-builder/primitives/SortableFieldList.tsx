import { For, Show, type JSX } from 'solid-js';
import { DragDropProvider } from '@dnd-kit/solid';
import { useSortable } from '@dnd-kit/solid/sortable';
import type { DragEndEvent } from '@dnd-kit/abstract';
import { moveInList } from '../model';

interface SortableRenderContext<T> {
  item: T;
  index: number;
  /** Attach to the row's drag-handle button so only the handle initiates a drag. */
  handleRef: (el: Element | undefined) => void;
  isDragging: () => boolean;
  isDropTarget: () => boolean;
}

interface SortableFieldListProps<T extends { clientId: string }> {
  items: T[];
  /** Unique identifier for this list instance. */
  group: string;
  onReorder: (next: T[]) => void;
  handleLabel: string;
  /** Rendered once per item; receives the drag handle ref + state. */
  children: (ctx: SortableRenderContext<T>) => JSX.Element;
  class?: string;
}

/**
 * Sortable field list. Each list owns its own DragDropProvider and a
 * unique `group`, so fields reorder only within their own list (drag never moves a field
 * out of its container). The reorder is
 * computed deterministically from the drag source/target + pointer midpoint.
 */
export function SortableFieldList<T extends { clientId: string }>(props: SortableFieldListProps<T>) {
  const handleDragEnd = (event: DragEndEvent): void => {
    const { operation } = event;
    const { source, target } = operation;
    if (!target || !source || source.id === target.id) return;

    // Decide before/after by comparing the pointer Y to the target's midpoint.
    const overEl = document.querySelector(`[data-sortable-id="${CSS.escape(String(target.id))}"]`) as Element | null;
    let insertPosition: 'before' | 'after' = 'after';
    if (overEl && source) {
      const rect = overEl.getBoundingClientRect();
      insertPosition = operation.position.current.y < rect.top + rect.height / 2 ? 'before' : 'after';
    }

    const next = moveInList(props.items, String(source.id), String(target.id), insertPosition);
    props.onReorder(next);
  };

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      <div class={props.class ?? 'fb-sortable-list'} data-sortable-list={props.group}>
        <For each={props.items}>
          {(item, index) => (
            <SortableItemWrap item={item} index={index()} group={props.group} handleLabel={props.handleLabel}>
              {props.children}
            </SortableItemWrap>
          )}
        </For>
        <Show when={props.items.length === 0}>
          <div class="fb-sortable-empty" />
        </Show>
      </div>
    </DragDropProvider>
  );
}

function SortableItemWrap<T extends { clientId: string }>(props: {
  item: T;
  index: number;
  group: string;
  handleLabel: string;
  children: (ctx: SortableRenderContext<T>) => JSX.Element;
}) {
  const { ref, handleRef, isDragging, isDropTarget } = useSortable({ id: props.item.clientId, group: props.group, index: props.index });
  return (
    <div
      ref={ref}
      data-sortable-id={props.item.clientId}
      data-sortable-group={props.group}
      class="fb-sortable-item"
      classList={{ 'is-dragging': isDragging(), 'is-drop-target': isDropTarget() }}
    >
      {props.children({ item: props.item, index: props.index, handleRef, isDragging, isDropTarget })}
    </div>
  );
}
