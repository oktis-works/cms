// @oktis-works/admin - Modal (genérico, reusa .modal-overlay/.modal do global.css)
//
// Backdrop fecha no clique; Escape fecha; o título vira aria-label do
// dialog. O overlay é `position: fixed` (enquadrado no chrome do dashboard),
// então nenhum overflow de card/formulário interfere.

import { Show, createEffect, onCleanup } from 'solid-js';
import type { JSX } from 'solid-js';
import { useTranslation } from '../../i18n';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: JSX.Element;
}

export function Modal(props: ModalProps) {
  const { t } = useTranslation();

  createEffect(() => {
    if (!props.open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKey);
    onCleanup(() => document.removeEventListener('keydown', onKey));
  });

  return (
    <Show when={props.open}>
      <div
        class="modal-overlay"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) props.onClose();
        }}
      >
        <section class="modal" role="dialog" aria-modal="true" aria-label={props.title}>
          <header class="modal-header">
            <h3>{props.title}</h3>
            <button
              type="button"
              class="modal-close"
              aria-label={t('common.close')}
              onClick={() => props.onClose()}
            >
              ×
            </button>
          </header>
          {props.children}
        </section>
      </div>
    </Show>
  );
}
