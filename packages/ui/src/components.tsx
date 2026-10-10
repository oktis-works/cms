// @oktis-works/ui - Componentes Solid reais (design-system do Admin)
//
// Cada componente consome as classes CSS globais do admin (.btn, .input, .card…)
// — o visual permanece o mesmo; o que muda é quem é dono da marcação.

import { Show, For, onCleanup, createEffect, type JSX } from 'solid-js';

// ── Interfaces públicas do design-system ─────────────────────────────

export interface Component {
  name: string;
  props: Record<string, unknown>;
  render: () => unknown;
}

export interface ButtonProps {
  variant: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
}

export interface InputProps {
  type?: string;
  name: string;
  value?: string;
  placeholder?: string;
  label?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectProps {
  name: string;
  value?: string;
  options: SelectOption[];
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: unknown;
}

export interface TableColumn {
  key: string;
  label: string;
  width?: string;
  sortable?: boolean;
  render?: (value: unknown, row: unknown) => unknown;
}

export interface TableProps {
  columns: TableColumn[];
  data: unknown[];
  loading?: boolean;
  emptyMessage?: string;
}

export interface ToastProps {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

export interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

const BTN_VARIANTS = ['primary', 'secondary', 'danger', 'ghost'] as const;

/** Botão — classes .btn .btn-{variant} .btn-sm. */
export function Button(props: ButtonProps & { children?: JSX.Element; type?: 'button' | 'submit' | 'reset'; class?: string }): JSX.Element {
  const variant = BTN_VARIANTS.includes(props.variant) ? props.variant : 'secondary';
  const classes = () =>
    ['btn', `btn-${variant}`, props.size === 'sm' ? 'btn-sm' : '', props.class ?? ''].filter(Boolean).join(' ');

  return (
    <button
      type={props.type ?? 'button'}
      class={classes()}
      disabled={props.disabled || props.loading}
      onClick={() => props.onClick?.()}
    >
      <Show when={props.loading} fallback={props.children}>
        <span class="spinner" aria-label="Carregando" />
      </Show>
    </button>
  );
}

/** Input com label opcional e mensagem de erro (.input). */
export function Input(props: InputProps & { onInput?: (value: string) => void; class?: string }): JSX.Element {
  const handleInput = (event: Event & { currentTarget: HTMLInputElement }): void => {
    props.onInput?.(event.currentTarget.value);
  };

  return (
    <div class={`field ${props.class ?? ''}`.trim()}>
      <Show when={props.label}>
        <label class="field__label">
          {props.label}
          {props.required ? <span aria-hidden="true"> *</span> : null}
          <input
            class="input"
            type={props.type ?? 'text'}
            name={props.name}
            value={props.value ?? ''}
            placeholder={props.placeholder}
            disabled={props.disabled}
            required={props.required}
            onInput={handleInput}
          />
        </label>
      </Show>
      <Show when={!props.label}>
        <input
          class="input"
          type={props.type ?? 'text'}
          name={props.name}
          value={props.value ?? ''}
          placeholder={props.placeholder}
          disabled={props.disabled}
          required={props.required}
          onInput={handleInput}
        />
      </Show>
      <Show when={props.error}>
        <p class="field__error notice--error">{props.error}</p>
      </Show>
    </div>
  );
}

/** Select com label opcional (.input nas options nativas). */
export function Select(props: SelectProps & { onChange?: (value: string) => void; class?: string }): JSX.Element {
  const options: SelectOption[] = props.options;

  return (
    <div class={`field ${props.class ?? ''}`.trim()}>
      <Show when={props.label}>
        <label class="field__label">
          {props.label}
          <select
            class="input"
            name={props.name}
            value={props.value ?? ''}
            disabled={props.disabled}
            onChange={(e) => props.onChange?.(e.currentTarget.value)}
          >
            <Show when={props.placeholder}>
              <option value="">{props.placeholder}</option>
            </Show>
            <For each={options}>{(option) => <option value={option.value}>{option.label}</option>}</For>
          </select>
        </label>
      </Show>
      <Show when={!props.label}>
        <select
          class="input"
          name={props.name}
          value={props.value ?? ''}
          disabled={props.disabled}
          onChange={(e) => props.onChange?.(e.currentTarget.value)}
        >
          <Show when={props.placeholder}>
            <option value="">{props.placeholder}</option>
          </Show>
          <For each={options}>{(option) => <option value={option.value}>{option.label}</option>}</For>
        </select>
      </Show>
    </div>
  );
}

/** Card — container .card com header opcional (.card-header). */
export function Card(props: { title?: string; class?: string; children?: JSX.Element }): JSX.Element {
  return (
    <div class={`card ${props.class ?? ''}`.trim()}>
      <Show when={props.title}>
        <div class="card-header">
          <h3>{props.title}</h3>
        </div>
      </Show>
      {props.children}
    </div>
  );
}

/** Badge de status — .badge .badge-{variant}. */
export function Badge(props: { variant?: 'success' | 'warning' | 'danger' | 'secondary'; children?: JSX.Element }): JSX.Element {
  const variant = props.variant ?? 'secondary';
  return <span class={`badge badge-${variant}`}>{props.children}</span>;
}

/** Modal — .modal-overlay > .modal > .modal-header; fecha por overlay ou ESC. */
export function Modal(props: ModalProps & { children?: JSX.Element }): JSX.Element {
  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') props.onClose();
  };

  // SSR: document não existe no servidor — guarda ambos os acessos
  createEffect(() => {
    if (typeof document === 'undefined') return;
    if (props.open) {
      document.addEventListener('keydown', handleKeyDown);
    } else {
      document.removeEventListener('keydown', handleKeyDown);
    }
  });

  onCleanup(() => {
    if (typeof document !== 'undefined') document.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <Show when={props.open}>
      <div
        class="modal-overlay"
        onClick={(event) => {
          if (event.target === event.currentTarget) props.onClose();
        }}
      >
        <div class="modal" role="dialog" aria-modal="true" aria-label={props.title}>
          <div class="modal-header">
            <h3>{props.title}</h3>
            <button type="button" class="btn btn-ghost btn-sm" aria-label="Fechar" onClick={() => props.onClose()}>
              ×
            </button>
          </div>
          <div class="modal-body">{props.children}</div>
        </div>
      </div>
    </Show>
  );
}

/** Toast — .toast .toast-{type}; auto-dismiss via duration (ms). */
export function Toast(props: ToastProps & { onDismiss?: () => void }): JSX.Element {
  createEffect(() => {
    if (props.duration && props.duration > 0) {
      const timer = setTimeout(() => props.onDismiss?.(), props.duration);
      onCleanup(() => clearTimeout(timer));
    }
  });

  const type = props.type === 'info' ? '' : `toast-${props.type}`;
  return (
    <div class={`toast ${type}`.trim()} role="status" onClick={() => props.onDismiss?.()}>
      {props.message}
    </div>
  );
}

/** Tabela genérica — .table com colunas declarativas e estado de loading. */
export function Table(props: TableProps & { children?: never }): JSX.Element {
  const columns: TableColumn[] = props.columns;

  return (
    <Show
      when={!props.loading}
      fallback={
        <div class="table-loading">
          <span class="spinner" aria-label="Carregando" />
        </div>
      }
    >
      <Show when={props.data.length > 0} fallback={<p class="muted">{props.emptyMessage ?? 'Nenhum registro.'}</p>}>
        <table class="table">
          <thead>
            <tr>
              <For each={columns}>{(column) => <th style={column.width ? { width: column.width } : undefined}>{column.label}</th>}</For>
            </tr>
          </thead>
          <tbody>
            <For each={props.data}>
              {(row) => (
                <tr>
                  <For each={columns}>
                    {(column) => (
                      <td>
                        <Show when={column.render} fallback={String((row as Record<string, unknown>)[column.key] ?? '')}>
                          {column.render?.((row as Record<string, unknown>)[column.key], row) as JSX.Element}
                        </Show>
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </Show>
  );
}

/** Paginação — .pagination com anterior/próxima e indicador de página. */
export function Pagination(props: PaginationProps): JSX.Element {
  const totalPages = (): number => Math.max(1, Math.ceil(props.total / Math.max(1, props.limit)));

  return (
    <Show when={totalPages() > 1}>
      <div class="pagination">
        <button
          class="btn btn-secondary btn-sm"
          type="button"
          disabled={props.page <= 1}
          onClick={() => props.onPageChange(props.page - 1)}
        >
          ← Anterior
        </button>
        <span class="muted">
          Página {props.page} de {totalPages()}
        </span>
        <button
          class="btn btn-secondary btn-sm"
          type="button"
          disabled={props.page >= totalPages()}
          onClick={() => props.onPageChange(props.page + 1)}
        >
          Próxima →
        </button>
      </div>
    </Show>
  );
}
