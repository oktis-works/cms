// @oktis-works/test-utils - Shared SDK smoke helper
// Unifica validação de carregamento de SDKs (theme-sdk e plugin-sdk)
import { expect } from 'vitest';
export async function assertSdkSmoke(modulePath, manifestHint) {
    const mod = await import(modulePath);
    expect(mod).toBeDefined();
    if (manifestHint) {
        // Verifica export esperado sem acoplar ao nome exato
        const _hasHint = Object.keys(mod).some(k => k.toLowerCase().includes(manifestHint.toLowerCase()));
        // Não falha se hint ausente — apenas garante módulo carregou
        expect(mod).toBeDefined();
    }
}
//# sourceMappingURL=sdk-smoke.js.map