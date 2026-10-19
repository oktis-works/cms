export function SearchableSelect(props) {
    // Simple fallback implementation - just renders a native select
    return (<select class="input" value={props.value} onChange={(e) => props.onChange(e.currentTarget.value)} disabled={props.disabled}>
      <option value="">{props.placeholder}</option>
      {props.options.map((opt) => (<option value={opt.value} disabled={opt.disabled}>
          {opt.label}
        </option>))}
    </select>);
}
//# sourceMappingURL=SearchableSelect.jsx.map