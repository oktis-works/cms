import { For, Show } from 'solid-js';
import { DragDropProvider } from '@dnd-kit/solid';
import { useSortable } from '@dnd-kit/solid/sortable';
import { moveInList } from '../model';
/**
 * Sortable field list. Each list owns its own DragDropProvider and a
 * unique `group`, so fields reorder only within their own list (drag never moves a field
 * out of its container). The reorder is
 * computed deterministically from the drag source/target + pointer midpoint.
 */
export function SortableFieldList(props) {
    const handleDragEnd = (event) => {
        const { operation } = event;
        const { source, target } = operation;
        if (!target || !source || source.id === target.id)
            return;
        // Decide before/after by comparing the pointer Y to the target's midpoint.
        const overEl = document.querySelector(`[data-sortable-id="${CSS.escape(String(target.id))}"]`);
        let insertPosition = 'after';
        if (overEl && source) {
            const rect = overEl.getBoundingClientRect();
            insertPosition = operation.position.current.y < rect.top + rect.height / 2 ? 'before' : 'after';
        }
        const next = moveInList(props.items, String(source.id), String(target.id), insertPosition);
        props.onReorder(next);
    };
    return (<DragDropProvider onDragEnd={handleDragEnd}>
      <div class={props.class ?? 'fb-sortable-list'} data-sortable-list={props.group}>
        <For each={props.items}>
          {(item, index) => (<SortableItemWrap item={item} index={index()} group={props.group} handleLabel={props.handleLabel}>
              {props.children}
            </SortableItemWrap>)}
        </For>
        <Show when={props.items.length === 0}>
          <div class="fb-sortable-empty"/>
        </Show>
      </div>
    </DragDropProvider>);
}
function SortableItemWrap(props) {
    const { ref, handleRef, isDragging, isDropTarget } = useSortable({ id: props.item.clientId, group: props.group, index: props.index });
    return (<div ref={ref} data-sortable-id={props.item.clientId} data-sortable-group={props.group} class="fb-sortable-item" classList={{ 'is-dragging': isDragging(), 'is-drop-target': isDropTarget() }}>
      {props.children({ item: props.item, index: props.index, handleRef, isDragging, isDropTarget })}
    </div>);
}
//# sourceMappingURL=SortableFieldList.jsx.map