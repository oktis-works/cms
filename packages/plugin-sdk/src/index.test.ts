import { describe, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSdkSmoke } from '../../test-utils/src/sdk-smoke.js';

// Caminhos absolutos: o import dinâmico do sdk-smoke resolve contra o próprio
// test-utils/src — paths relativos ('./types.js') precisam partir do teste.
const here = dirname(fileURLToPath(import.meta.url));

describe('PluginSDK', () => {
  it('should export plugin manifest type', async () => {
    await assertSdkSmoke(join(here, 'types.js'), 'PluginManifest');
  });
  it('should load main entry', async () => {
    await assertSdkSmoke(join(here, 'index.js'));
  });
});
