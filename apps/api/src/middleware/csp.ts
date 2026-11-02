// @oktis-works/api - Content Security Policy Middleware

import type { Context, Next } from 'hono';

export interface CspOptions {
  /** CSP directives object */
  directives: Record<string, string | string[]>;
  /** Report-only mode (doesn't block, only reports) */
  reportOnly?: boolean;
  /** Report URI for CSP violations */
  reportUri?: string;
}

const DEFAULT_API_CSP = {
  'default-src': "'none'",
  'frame-ancestors': "'none'",
  'base-uri': "'none'",
  'form-action': "'none'",
};

const DEFAULT_ADMIN_CSP = {
  'default-src': "'self'",
  'script-src': "'self' 'wasm-unsafe-eval'",
  'style-src': "'self' 'unsafe-inline'",
  'img-src': "'self' data:",
  'font-src': "'self' data:",
  'connect-src': "'self'",
  'frame-ancestors': "'none'",
  'base-uri': "'self'",
  'form-action': "'self'",
};

const DEFAULT_WEB_CSP = {
  'default-src': "'self'",
  'script-src': "'self'",
  'style-src': "'self' 'unsafe-inline'",
  'img-src': "'self' data: https:",
  'font-src': "'self' data:",
  'connect-src': "'self'",
  'frame-ancestors': "'none'",
  'base-uri': "'self'",
  'form-action': "'self'",
};

function buildCspHeader(directives: Record<string, string | string[]>): string {
  return Object.entries(directives)
    .map(([key, value]) => {
      const values = Array.isArray(value) ? value.join(' ') : value;
      return `${key} ${values}`;
    })
    .join('; ');
}

export function cspMiddleware(options: CspOptions = { directives: DEFAULT_API_CSP }) {
  const headerName = options.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
  const cspHeader = buildCspHeader(options.directives);
  const finalHeader = options.reportUri ? `${cspHeader}; report-uri ${options.reportUri}` : cspHeader;

  return async (c: Context, next: Next) => {
    c.header(headerName, finalHeader);
    await next();
  };
}

export const apiCspMiddleware = cspMiddleware({ directives: DEFAULT_API_CSP });
export const adminCspMiddleware = cspMiddleware({ directives: DEFAULT_ADMIN_CSP });
export const webCspMiddleware = cspMiddleware({ directives: DEFAULT_WEB_CSP });

export function createCspMiddleware(directives: Record<string, string | string[]>, reportOnly = false, reportUri?: string) {
  return cspMiddleware({ directives, reportOnly, reportUri });
}