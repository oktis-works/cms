import { createSignal, Show, type JSX } from 'solid-js';
import { FbIcon } from './FbIcon';

interface TooltipProps {
  content: string | JSX.Element;
  children: JSX.Element;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  class?: string;
}

export function Tooltip(props: TooltipProps): JSX.Element {
  const [visible, setVisible] = createSignal(false);
  let showTimer: ReturnType<typeof setTimeout> | null = null;

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

  return (
    <div class="fb-tooltip-wrapper" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {props.children}
      <Show when={visible()}>
        <div class="fb-tooltip" data-position={props.position ?? 'top'}>
          <div class="fb-tooltip__content">{props.content}</div>
          <div class="fb-tooltip__arrow" />
        </div>
      </Show>
    </div>
  );
}

interface InfoTooltipProps {
  content: string | JSX.Element;
  label?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function InfoTooltip(props: InfoTooltipProps): JSX.Element {
  return (
    <Tooltip content={props.content} position={props.position ?? 'top'}>
      <span class="fb-info-icon" aria-label={props.label} tabindex="0">
        <FbIcon name="info" class="fb-info-icon__icon" />
      </span>
    </Tooltip>
  );
}