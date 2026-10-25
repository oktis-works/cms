// @oktis-works/admin - Plugin menu page host

import { Show, createSignal, onMount, type JSX } from 'solid-js';
import { loadExtensions } from './store';
import { PluginComponentHost } from './slots';

export function PluginPageHost(props: { slug: string }): JSX.Element {
  const [componentId, setComponentId] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  onMount(async () => {
    const state = await loadExtensions();
    const menu = state.menuPages.find((page) => page.slug === props.slug);
    const submenu = state.submenuPages.find((page) => page.slug === props.slug);
    const component = menu?.componentId ?? submenu?.componentId;
    if (component) setComponentId(component);
    else setError(`No component is registered for plugin page "${props.slug}"`);
  });

  return (
    <Show
      when={componentId()}
      fallback={<span class="muted" data-plugin-component-error={props.slug}>{error() ?? 'Loading plugin page…'}</span>}
    >
      <PluginComponentHost componentId={componentId()!} />
    </Show>
  );
}
