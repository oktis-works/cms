import { defineConfig, type Plugin } from 'vitest/config';
import path from 'node:path';
import { createRequire } from 'node:module';

// Entrada CJS do @aws-sdk/client-s3: dist-es (ESM) tem imports extensionless que
// falham ao serem carregados nativamente pelo runner do vitest — apontamos o alias
// para dist-cjs (forma suportada por require/nativa).
const awsRequire = createRequire(path.resolve(__dirname, 'packages/core/package.json'));
const awsEntry = awsRequire.resolve('@aws-sdk/client-s3');
// @aws-sdk/core é transitivo (dep do client-s3) — resolve a partir dele
const awsCoreEntry = createRequire(awsEntry).resolve('@aws-sdk/core');

// O Vite 6 força "module" em resolve.conditions (DEFAULT_SERVER_CONDITIONS) e o
// vitest repassa resolve.conditions do vite como `--conditions module` ao worker
// forks. O exports do @aws-sdk/core lista "module" (dist-es — ESM com imports
// extensionless que o node não resolve) ANTES de "node"/"require" (dist-cjs),
// então qualquer require() nativo de @aws-sdk/core dentro dos testes carrega o
// dist-es e explode. Remove "module" das conditions já resolvidas: o worker e o
// vite voltam a resolver dist-cjs (CJS correto) para os pacotes aws.
const stripModuleCondition: Plugin = {
  name: 'okcms:strip-module-condition',
  configResolved(config) {
    const conditions = (config.resolve as { conditions?: string[] }).conditions;
    if (Array.isArray(conditions)) {
      const i = conditions.indexOf('module');
      if (i !== -1) conditions.splice(i, 1);
    }
  },
};

export default defineConfig({
  plugins: [stripModuleCondition],
  test: {
    globals: true,
    environment: 'node',
    server: {
      deps: {
        // Plugins de teste em /tmp são carregados nativamente (import direto)
        external: [/^\/tmp\//],
        // @aws-sdk/client-s3 e @aws-sdk/core: mantém o processamento pelo vite
        // (resolver + alias para dist-cjs) em vez de externalizar o specifier.
        inline: ['@aws-sdk/client-s3', '@aws-sdk/core'],
      },
    },
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/*/tests/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
      'apps/*/tests/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'packages/*/src/**/*.ts',
        'apps/*/src/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        '**/dist/**',
        '**/node_modules/**',
      ],
    },
  },
  // O Vite 6 default do servidor inclui "module" (→ dist-es do @aws-sdk/*), e o
  // vitest repassa resolve.conditions do vite como `--conditions` ao worker forks.
  // Com "module" ativo, `require('@aws-sdk/core')` nativo resolve dist-es (ESM com
  // imports extensionless) antes de "node"/"require" → dist-cjs e explode no node.
  // Sem "module", vite e node caem em "node" → dist-cjs (CJS correto).
  resolve: {
    conditions: ['node', 'development|production'],
    alias: {
      '@oktis-works/types': path.resolve(__dirname, 'packages/types/src'),
      '@oktis-works/config': path.resolve(__dirname, 'packages/config/src'),
      '@oktis-works/database': path.resolve(__dirname, 'packages/database/src'),
      '@oktis-works/auth': path.resolve(__dirname, 'packages/auth/src'),
      '@oktis-works/core': path.resolve(__dirname, 'packages/core/src'),
      '@oktis-works/validation': path.resolve(__dirname, 'packages/validation/src'),
      '@oktis-works/validation/basic': path.resolve(__dirname, 'packages/validation/src/basic.ts'),
      '@oktis-works/validation/choice': path.resolve(__dirname, 'packages/validation/src/choice.ts'),
      '@oktis-works/validation/client-validate': path.resolve(__dirname, 'packages/validation/src/client-validate.ts'),
      '@oktis-works/validation/conditional': path.resolve(__dirname, 'packages/validation/src/conditional.ts'),
      '@oktis-works/validation/media': path.resolve(__dirname, 'packages/validation/src/media.ts'),
      '@oktis-works/validation/relational': path.resolve(__dirname, 'packages/validation/src/relational.ts'),
      '@oktis-works/validation/structural': path.resolve(__dirname, 'packages/validation/src/structural.ts'),
      '@oktis-works/validation/clone': path.resolve(__dirname, 'packages/validation/src/clone.ts'),
      '@oktis-works/plugin-sdk': path.resolve(__dirname, 'packages/plugin-sdk/src'),
      '@oktis-works/theme-sdk': path.resolve(__dirname, 'packages/theme-sdk/src'),
      '@oktis-works/plugin-runtime': path.resolve(__dirname, 'packages/plugin-runtime/src'),
      '@oktis-works/theme-runtime': path.resolve(__dirname, 'packages/theme-runtime/src'),
      '@oktis-works/api-client': path.resolve(__dirname, 'packages/api-client/src'),
      '@oktis-works/cms': path.resolve(__dirname, 'packages/cli/src'),
      '@oktis-works/ui': path.resolve(__dirname, 'packages/ui/src'),
      '@oktis-works/test-utils': path.resolve(__dirname, 'packages/test-utils'),
      '@aws-sdk/client-s3': awsEntry,
      '@aws-sdk/core': awsCoreEntry,
    },
  },
});
