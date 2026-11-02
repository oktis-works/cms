// @oktis-works/admin - Plugin Worker Host Component
// Communicates with plugin-worker via Comlink for sandboxed rendering

import { createSignal, onMount, onCleanup, Show, Switch, Match, type JSX } from 'solid-js';
import { wrap } from 'comlink';
import type { PluginWorkerAPI } from '../workers/plugin-worker';

interface PluginWorkerHostProps {
  componentPath: string;
  mode: 'config' | 'renderer';
  props: Record<string, unknown>;
  fallback?: () => JSX.Element;
}

export function PluginWorkerHost(props: PluginWorkerHostProps) {
  const [html, setHtml] = createSignal<string>('');
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);
  let workerApi: PluginWorkerAPI | null = null;
  let worker: Worker | null = null;

  onMount(() => {
    async function init() {
      try {
        worker = new Worker(new URL('../workers/plugin-worker.tsx', import.meta.url), { type: 'module' });
        workerApi = wrap<PluginWorkerAPI>(worker);
        await render();
      } catch (e) {
        setError(`Worker initialization failed: ${e instanceof Error ? e.message : String(e)}`);
        setLoading(false);
      }
    }
    init();
  });

  onCleanup(() => {
    worker?.terminate();
  });

  async function render() {
    if (!workerApi) return;
    setLoading(true);
    setError(null);
    try {
      let result;
      if (props.mode === 'config') {
        result = await workerApi.renderConfig(props.componentPath, props.props as any);
      } else {
        result = await workerApi.renderRenderer(props.componentPath, props.props as any);
      }
      if (result.error) {
        setError(result.error);
        setHtml('');
      } else {
        setHtml(result.html);
      }
    } catch (e) {
      setError(`Render failed: ${e instanceof Error ? e.message : String(e)}`);
      setHtml('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Switch>
      <Match when={loading()}>
        <div class="fb-plugin-worker-host fb-plugin-worker-host--loading">
          <div class="fb-spinner" aria-hidden="true"></div>
          <span>Loading plugin component...</span>
        </div>
      </Match>
      <Match when={error()}>
        <div class="fb-plugin-worker-host fb-plugin-worker-host--error">
          <i data-lucide="alert-triangle" aria-hidden="true"></i>
          <div>
            <strong>Plugin component failed to load</strong>
            <p class="muted">{error()}</p>
            <Show when={props.fallback}>
              <details class="fb-fallback-config">
                <summary>Show fallback</summary>
                {props.fallback!()}
              </details>
            </Show>
          </div>
        </div>
      </Match>
      <Match when={true}>
        <div class="fb-plugin-worker-host" innerHTML={html()} />
      </Match>
    </Switch>
  );
}