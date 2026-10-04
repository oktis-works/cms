import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

// Build lib SSR do design-system: os componentes são compilados com
// generate:'ssr' (babel-preset-solid) — sem delegateEvents nem APIs
// client-only — para o SSR do admin (Astro) consumir com segurança.
export default defineConfig({
  plugins: [solid({ ssr: true })],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    rollupOptions: {
      external: ['solid-js', 'solid-js/web', 'solid-js/store', 'solid-js/server', '@oktis-works/validation'],
      output: {
        entryFileNames: 'server.js',
      },
    },
  },
});
