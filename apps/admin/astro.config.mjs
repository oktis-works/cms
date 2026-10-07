import { defineConfig } from 'astro/config';
import solid from '@astrojs/solid-js';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  redirects: { '/dashboard': '/' },
  integrations: [solid()],
  server: { port: 3011, host: true, allowedHosts: ['admin.lvh.me'] },
  vite: {
    resolve: { conditions: ['source'] },
    ssr: { noExternal: ['@oktis-works/types', '@oktis-works/ui'] },
  },
});