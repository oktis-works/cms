// @oktis-works/validation - Theme render contract validation
//
// Shared by core (install/sync), the CLI (scaffold/build), the theme runtime
// (discovery) and the web app (parent manifests). Pure: no filesystem access.

export type ThemeRenderEngine = 'template' | 'react' | 'solid';

export interface ThemeRenderConfigLike {
  engine?: unknown;
  apiVersion?: unknown;
  hydration?: unknown;
  entry?: unknown;
}

export interface ThemeRenderManifestLike {
  name?: unknown;
  version?: unknown;
  type?: unknown;
  render?: unknown;
}

const VALID_ENGINES: readonly ThemeRenderEngine[] = ['template', 'react', 'solid'];

/** A render entry must stay inside the theme and be a relative path. */
export function isSafeThemeRenderEntry(value: string): boolean {
  if (!value || value.length > 300) return false;
  if (value.includes('..') || value.includes('\\') || value.includes('://')) return false;
  if (value.startsWith('/') || value.startsWith('~')) return false;
  return true;
}

/**
 * Validates a `theme.json` `render` object.
 * An absent value is valid and means the legacy template engine.
 */
export function validateThemeRenderConfig(render: unknown): string[] {
  if (render === undefined || render === null) return [];
  if (typeof render !== 'object' || Array.isArray(render)) {
    return ['render must be an object'];
  }

  const config = render as ThemeRenderConfigLike;
  const issues: string[] = [];
  const engine = config.engine ?? 'template';

  if (typeof engine !== 'string' || !VALID_ENGINES.includes(engine as ThemeRenderEngine)) {
    issues.push(`render.engine must be one of: ${VALID_ENGINES.join(', ')}`);
  }

  if (config.apiVersion !== undefined && config.apiVersion !== 1) {
    issues.push('render.apiVersion must be 1');
  }

  if (config.hydration !== undefined && config.hydration !== 'none' && config.hydration !== 'islands') {
    issues.push('render.hydration must be "none" or "islands"');
  }

  if (config.entry !== undefined) {
    if (typeof config.entry !== 'string' || !isSafeThemeRenderEntry(config.entry)) {
      issues.push('render.entry must be a safe relative path inside the theme');
    }
  }

  return issues;
}

/** Validates the render-related portion of a complete theme manifest. */
export function validateThemeManifestRender(manifest: unknown): string[] {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['theme manifest must be an object'];
  }
  const record = manifest as ThemeRenderManifestLike;
  if (record.type !== undefined && record.type !== 'theme') {
    return ['theme manifest type must be "theme"'];
  }
  return validateThemeRenderConfig(record.render);
}
