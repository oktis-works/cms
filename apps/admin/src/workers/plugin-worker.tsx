// @oktis-works/admin - Plugin Worker Entry Point
// Runs in a separate Web Worker, exposes plugin component rendering via Comlink

import { expose } from 'comlink';
import { renderToString } from 'solid-js/web';

interface PluginComponentProps {
  config?: Record<string, unknown>;
  schema?: Record<string, unknown>;
  value?: unknown;
  onChange?: (value: unknown) => void;
  disabled?: boolean;
  field?: {
    type: string;
    name: string;
    label: string;
    config: Record<string, unknown>;
    required: boolean;
    instructions?: string;
  };
  t?: (key: string) => string;
}

interface RenderResult {
  html: string;
  error?: string;
}

async function loadPluginComponent(componentPath: string): Promise<any> {
  try {
    const module = await import(componentPath);
    return module.default || module.PluginFieldConfig || module.PluginFieldRenderer;
  } catch (e) {
    throw new Error(`Failed to load plugin component: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const api = {
  async renderConfig(componentPath: string, props: PluginComponentProps): Promise<RenderResult> {
    try {
      const Component = await loadPluginComponent(componentPath);
      if (!Component) {
        return { html: '', error: 'Component not found in module' };
      }
      const html = renderToString(() => <Component {...props} />);
      return { html };
    } catch (e) {
      return { html: '', error: e instanceof Error ? e.message : String(e) };
    }
  },

  async renderRenderer(componentPath: string, props: PluginComponentProps): Promise<RenderResult> {
    try {
      const Component = await loadPluginComponent(componentPath);
      if (!Component) {
        return { html: '', error: 'Component not found in module' };
      }
      const html = renderToString(() => <Component {...props} />);
      return { html };
    } catch (e) {
      return { html: '', error: e instanceof Error ? e.message : String(e) };
    }
  },

  async validateConfig(componentPath: string, config: Record<string, unknown>): Promise<{ valid: boolean; errors: string[] }> {
    try {
      const Component = await loadPluginComponent(componentPath);
      if (!Component || typeof Component.validate !== 'function') {
        return { valid: true, errors: [] };
      }
      const errors = await Component.validate(config);
      return { valid: errors.length === 0, errors };
    } catch {
      return { valid: false, errors: ['Validation failed'] };
    }
  },

  async getSchema(componentPath: string): Promise<Record<string, unknown> | null> {
    try {
      const Component = await loadPluginComponent(componentPath);
      if (!Component || typeof Component.getSchema !== 'function') {
        return null;
      }
      return await Component.getSchema();
    } catch {
      return null;
    }
  },
};

expose(api);

export type PluginWorkerAPI = typeof api;