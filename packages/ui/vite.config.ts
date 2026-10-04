import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

// Build lib do design-system: JSX Solid compilado (babel-preset-solid) para
// dist/index.js ES — consumível pelo admin (Astro/Vite) e por npm.
export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
    },
    outDir: 'dist',
    // NÃO limpa: o tsc --emitDeclarationOnly já gerou os .d.ts no dist
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    rollupOptions: {
      external: ['solid-js', 'solid-js/web', 'solid-js/store', '@oktis-works/validation'],
    },
  },
});
