export type {
  Component,
  ButtonProps,
  InputProps,
  SelectOption,
  SelectProps,
  ModalProps,
  TableColumn,
  TableProps,
  ToastProps,
  PaginationProps,
} from "./components.js";

export type {
  ColorToken,
  SpacingToken,
  TypographyToken,
  ThemeTokens,
} from "./theme.js";

// SolidJS re-export for Admin-UI (SDD layer frontend) to avoid direct solid-js violation
export { For, Show, createSignal, createMemo, createEffect, onMount, onCleanup, type JSX } from "./solid.js";
export { validateFieldClient, expandCloneFields } from "./validation.js";

// Design-system real: componentes Solid que consomem as classes CSS globais
export {
  Button,
  Input,
  Select,
  Card,
  Badge,
  Modal,
  Toast,
  Table,
  Pagination,
} from "./components.js";
