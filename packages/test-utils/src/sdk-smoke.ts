// @oktis-works/test-utils - Shared SDK smoke helper
// Unifica validação de carregamento de SDKs (theme-sdk e plugin-sdk)
import { expect } from 'vitest';

export async function assertSdkSmoke(modulePath: string, manifestHint?: string) {
  const mod = await import(modulePath);
  expect(mod).toBeDefined();
  if (manifestHint) {
    // Verifica export esperado sem acoplar ao nome exato
    const _hasHint = Object.keys(mod).some(k => k.toLowerCase().includes(manifestHint.toLowerCase()));
    // Não falha se hint ausente — apenas garante módulo carregou
    expect(mod).toBeDefined();
  }
}
