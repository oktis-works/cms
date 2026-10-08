import { For, Show, type JSX } from 'solid-js';

export interface TabItem {
  id: string;
  label: string;
  /** Small badge shown next to the label (e.g. "Active" on Conditional Logic). */
  badge?: string;
  disabled?: boolean;
}

interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  /** Optional aria-label for the tablist. */
  ariaLabel?: string;
  children: JSX.Element;
}

/**
 * Settings tabs (General · Validation · Presentation · Conditional
 * Logic · Advanced). The active tab id is controlled by the parent; the panel
 * content is rendered as `children`.
 */
export function Tabs(props: TabsProps) {
  return (
    <div class="fb-tabs">
      <div class="fb-tabs__list" role="tablist" aria-label={props.ariaLabel}>
        <For each={props.tabs}>
          {(tab) => (
            <button
              type="button"
              role="tab"
              class="fb-tabs__tab"
              classList={{
                'is-active': props.active === tab.id,
                'is-disabled': Boolean(tab.disabled),
              }}
              aria-selected={props.active === tab.id}
              disabled={tab.disabled}
              onClick={() => props.onChange(tab.id)}
            >
              <span>{tab.label}</span>
              <Show when={tab.badge}>
                <span class="fb-tabs__badge">{tab.badge}</span>
              </Show>
            </button>
          )}
        </For>
      </div>
      <div class="fb-tabs__panel" role="tabpanel">{props.children}</div>
    </div>
  );
}
