export interface Component {
  name: string;
  props: Record<string, unknown>;
  render: () => unknown;
}

export interface ButtonProps {
  variant: "primary" | "secondary" | "danger" | "ghost";
  size: "sm" | "md" | "lg";
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
  type: "success" | "error" | "warning" | "info";
  message: string;
  duration?: number;
}

export interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}
