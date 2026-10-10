import { defineConfig } from 'astro/config';
import solid from '@astrojs/solid-js';
import node from '@astrojs/node';

// DEV proxy: forward /api to API server to avoid cross-port cookie issues.
// Set ADMIN_API_PROXY_TARGET=http://localhost:3000 (or api.lvh.me:3000) in .env
// If not set, no proxy is used (production or lvh.me setup).
const apiProxyTarget = process.env['ADMIN_API_PROXY_TARGET'];

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  redirects: { '/dashboard': '/' },
  integrations: [solid()],
  server: { port: 3011, host: true, allowedHosts: ['admin.lvh.me', 'localhost'] },
  vite: {
    resolve: { conditions: ['source'] },
    ssr: { noExternal: ['@oktis-works/types', '@oktis-works/ui'] },
    ...(apiProxyTarget
      ? {
          server: {
            proxy: {
              '/api': {
                target: apiProxyTarget,
                changeOrigin: true,
                ws: true,
              },
            },
          },
        }
      : {}),
  },
});