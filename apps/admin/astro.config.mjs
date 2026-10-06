import { defineConfig } from 'astro/config';
import solid from '@astrojs/solid-js';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  // Sidebar/link antigos apontavam para /dashboard (inexistente) — redireciona
  redirects: {
    '/dashboard': '/',
  },
  integrations: [
    solid(),
  ],
  middleware: [
    './src/middleware/i18n.ts',
  ],
  server: {
    port: 3011,
    host: true,
    allowedHosts: ['admin.lvh.me'],
  },
  vite: {
    // Design-system: consome a FONTE do @oktis-works/ui para que o plugin Solid
    // compile JSX por ambiente (SSR: generate 'ssr'; client: generate 'dom').
    // O dist client-only (delegateEvents/template) quebrava o SSR do admin.
    resolve: {
      conditions: ['source'],
    },
    ssr: {
      noExternal: ['@oktis-works/types', '@oktis-works/ui'],
    },
  },
});
