import type { JSX } from 'solid-js';

export interface PageHeaderProps {
  /** Eyebrow text (small uppercase label above title) */
  eyebrow?: string;
  /** Main page title */
  title: string;
  /** Description text below title */
  description?: string;
  /** Action buttons/links on the right */
  actions?: JSX.Element;
  /** Toolbar content (filters, search, etc.) */
  toolbar?: JSX.Element;
  /** Additional CSS classes */
  class?: string;
}

export function PageHeader(props: PageHeaderProps) {
  const { eyebrow, title, description, actions, toolbar, class: className, ...rest } = props;

  return (
    <div class={`fb-page-header ${className || ''}`} {...rest}>
      <div class="fb-page-header__main">
        {eyebrow && <span class="fb-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p class="muted">{description}</p>}
      </div>
      {actions && <div class="fb-page-header__actions">{actions}</div>}
      {toolbar && <div class="fb-page-header__toolbar">{toolbar}</div>}
    </div>
  );
}

export interface PageContentProps {
  children: JSX.Element;
  class?: string;
}

export function PageContent(props: PageContentProps) {
  const { children, class: className, ...rest } = props;
  return (
    <div class={`fb-page-content ${className || ''}`} {...rest}>
      {children}
    </div>
  );
}

export interface CardProps {
  children: JSX.Element;
  class?: string;
  padding?: boolean;
}

export function Card(props: CardProps) {
  const { children, class: className, padding = true, ...rest } = props;
  return (
    <section class={`card ${padding ? 'card--padded' : ''} ${className || ''}`} {...rest}>
      {children}
    </section>
  );
}

export interface ToolbarProps {
  children: JSX.Element;
  class?: string;
}

export function Toolbar(props: ToolbarProps) {
  const { children, class: className, ...rest } = props;
  return (
    <div class={`fb-toolbar ${className || ''}`} {...rest}>
      {children}
    </div>
  );
}

export interface ToolbarFilterProps {
  label: string;
  select: JSX.Element;
}

export function ToolbarFilter(props: ToolbarFilterProps) {
  const { label, select } = props;
  return (
    <label class="fb-toolbar__filter">
      <span>{label}</span>
      {select}
    </label>
  );
}

export interface ToolbarSearchProps {
  placeholder: string;
  value: string;
  onInput: (e: Event) => void;
  class?: string;
}

export function ToolbarSearch(props: ToolbarSearchProps) {
  const { placeholder, value, onInput, class: className, ...rest } = props;
  return (
    <input
      class={`input fb-toolbar__search ${className || ''}`}
      type="search"
      placeholder={placeholder}
      value={value}
      onInput={onInput}
      {...rest}
    />
  );
}