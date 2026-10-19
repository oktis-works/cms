export function PageHeader(props) {
    const { eyebrow, title, description, actions, toolbar, class: className, ...rest } = props;
    return (<div class={`fb-page-header ${className || ''}`} {...rest}>
      <div class="fb-page-header__main">
        {eyebrow && <span class="fb-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p class="muted">{description}</p>}
      </div>
      {actions && <div class="fb-page-header__actions">{actions}</div>}
      {toolbar && <div class="fb-page-header__toolbar">{toolbar}</div>}
    </div>);
}
export function PageContent(props) {
    const { children, class: className, ...rest } = props;
    return (<div class={`fb-page-content ${className || ''}`} {...rest}>
      {children}
    </div>);
}
export function Card(props) {
    const { children, class: className, padding = true, ...rest } = props;
    return (<section class={`card ${padding ? 'card--padded' : ''} ${className || ''}`} {...rest}>
      {children}
    </section>);
}
export function Toolbar(props) {
    const { children, class: className, ...rest } = props;
    return (<div class={`fb-toolbar ${className || ''}`} {...rest}>
      {children}
    </div>);
}
export function ToolbarFilter(props) {
    const { label, select } = props;
    return (<label class="fb-toolbar__filter">
      <span>{label}</span>
      {select}
    </label>);
}
export function ToolbarSearch(props) {
    const { placeholder, value, onInput, class: className, ...rest } = props;
    return (<input class={`input fb-toolbar__search ${className || ''}`} type="search" placeholder={placeholder} value={value} onInput={onInput} {...rest}/>);
}
//# sourceMappingURL=PageHeader.jsx.map