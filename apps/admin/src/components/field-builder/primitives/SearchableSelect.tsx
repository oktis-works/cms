import type { JSX } from 'solid-js';

interface SearchableSelectProps {
  value: string;
  options: { value: string; label: string; icon?: string; disabled?: boolean }[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  noResultsText?: string;
  class?: string;
  disabled?: boolean;
  clearable?: boolean;
}

export function SearchableSelect(props: SearchableSelectProps): JSX.Element {
  // Simple fallback implementation - just renders a native select
  return (
    <select
      class="input"
      value={props.value}
      onChange={(e) => props.onChange(e.currentTarget.value)}
      disabled={props.disabled}
    >
      <option value="">{props.placeholder}</option>
      {props.options.map((opt) => (
        <option value={opt.value} disabled={opt.disabled}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}