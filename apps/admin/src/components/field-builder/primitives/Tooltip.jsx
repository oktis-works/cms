import { createSignal, Show } from 'solid-js';
import { FbIcon } from './FbIcon';
export function Tooltip(props) {
    const [visible, setVisible] = createSignal(false);
    let showTimer = null;
    const show = () => {
        showTimer = setTimeout(() => setVisible(true), props.delay ?? 200);
    };
    const hide = () => {
        if (showTimer) {
            clearTimeout(showTimer);
            showTimer = null;
        }
        setVisible(false);
    };
    return (<div class="fb-tooltip-wrapper" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {props.children}
      <Show when={visible()}>
        <div class="fb-tooltip" data-position={props.position ?? 'top'}>
          <div class="fb-tooltip__content">{props.content}</div>
          <div class="fb-tooltip__arrow"/>
        </div>
      </Show>
    </div>);
}
export function InfoTooltip(props) {
    return (<Tooltip content={props.content} position={props.position ?? 'top'}>
      <span class="fb-info-icon" aria-label={props.label} tabindex="0">
        <FbIcon name="info" class="fb-info-icon__icon"/>
      </span>
    </Tooltip>);
}
//# sourceMappingURL=Tooltip.jsx.map