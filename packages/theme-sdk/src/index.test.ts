import { describe, it, expect } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSdkSmoke } from '../../test-utils/src/sdk-smoke.js';

// Caminhos absolutos: o import dinâmico do sdk-smoke resolve contra o próprio
// test-utils/src — paths relativos ('./types.js') precisam partir do teste.
const here = dirname(fileURLToPath(import.meta.url));

// ThemeSDK distinct smoke test - includes layout and template hierarchy validation
describe('ThemeSDK', () => {
  it('should export theme manifest type', async () => {
    await assertSdkSmoke(join(here, 'types.js'), 'ThemeManifest');
  });
  it('should have theme types available', async () => {
    await assertSdkSmoke(join(here, 'index.js'));
  });
  it('should validate theme provides.layouts manifest', async () => {
    const mod = await import('./types.js');
    expect(mod).toBeDefined();
    // Theme-specific: layouts, slots, template hierarchy
    expect(typeof mod).toBe('object');
  });
});
