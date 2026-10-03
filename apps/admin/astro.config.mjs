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
  server: {
    port: 3001,
    host: true,
  },
  vite: {
    ssr: {
      noExternal: ['@oktis-works/types'],
    },
  },
});
