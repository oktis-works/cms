// @oktis-works/core - Fiação do runtime de hooks (WP1)
//
// Em dev o registry exige prefixo `okcms.`/`plugin.`; sem a allowlist do
// catálogo, os próprios nomes oficiais do core seriam reprovados e o plugin
// cairia em falha isolada no boot. Aqui validamos que o catálogo cobre todos
// os HOOK_POINTS (estáticos e parametrizados) e que a fiação injeta tudo.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { HookRegistry, setHookRegistryStore, setHookTenantResolver } from '@oktis-works/plugin-runtime';
import { HOOK_POINTS } from './points.js';
import { hookCatalogNames, installHookRuntimeWiring } from './wiring.js';
afterEach(() => {
    setHookRegistryStore(null);
    setHookTenantResolver(() => null);
});
function devRegistry() {
    const registry = new HookRegistry();
    registry.setDevMode(true);
    registry.setKnownHooks(hookCatalogNames());
    return registry;
}
describe('hookCatalogNames', () => {
    it('cobre todos os pontos estáticos do core', () => {
        const names = hookCatalogNames();
        for (const value of Object.values(HOOK_POINTS)) {
            if (typeof value !== 'string')
                continue;
            expect(names).toContain(value);
        }
        expect(names).toContain('content:query');
        expect(names).toContain('theme:head');
        expect(names).toContain('admin:notices');
    });
    it('gera prefixos para os pontos parametrizados', () => {
        const names = hookCatalogNames();
        expect(names).toContain('before_publish_content_*');
        expect(names).toContain('after_publish_content_*');
        expect(names).toContain('before_save_content_*');
        expect(names).toContain('theme:data:*');
        expect(names).toContain('manage:*');
        expect(names).toContain('rest:*');
        expect(names).toContain('settings:defaults:*');
    });
});
describe('allowlist em modo dev', () => {
    it('todos os nomes do catálogo (estáticos e de exemplo) são aceitos', () => {
        const registry = devRegistry();
        // Coleta todos os valores string (hooks estáticos)
        const statics = [];
        for (const v of Object.values(HOOK_POINTS)) {
            if (typeof v === 'string')
                statics.push(v);
        }
        // Coleta exemplos dos hooks parametrizados
        const samples = [];
        for (const v of Object.values(HOOK_POINTS)) {
            if (typeof v === 'function') {
                try {
                    // Alguns hooks aceitam 1 arg, outros 2 - usamos type assertion para evitar erro de tipo
                    const fn = v;
                    samples.push(fn.length >= 2 ? fn('post', 'field') : fn('post'));
                }
                catch {
                    // ignora funções que falham
                }
            }
        }
        for (const name of [...statics, ...samples]) {
            expect(() => registry.addAction(name, () => { })).not.toThrow();
            expect(() => registry.addFilter(name, (v) => v)).not.toThrow();
        }
    });
    it('exemplos reais usados em docs/scaffold passam em dev', () => {
        const registry = devRegistry();
        for (const name of ['content:query', 'after_publish_content_post', 'theme:data:posts', 'manage:post:columns']) {
            expect(() => registry.addAction(name, () => { })).not.toThrow();
        }
        expect(() => registry.addAction('qualquer:hok:inventado', () => { })).toThrow('prefixados');
    });
    it('sem a fiação instalada, um HookRegistry dev puro continua estrito', () => {
        const registry = new HookRegistry();
        registry.setDevMode(true);
        expect(() => registry.addAction('content:query', () => { })).toThrow('prefixados');
    });
});
describe('installHookRuntimeWiring', () => {
    it('é idempotente e injeta catálogo + resolver de tenant no store global', () => {
        const store = { setKnownHooks: vi.fn(), tenant: vi.fn(), platform: vi.fn() };
        setHookRegistryStore(store);
        const resolverSpy = vi.fn(() => null);
        setHookTenantResolver(resolverSpy);
        installHookRuntimeWiring();
        installHookRuntimeWiring();
        expect(store.setKnownHooks).toHaveBeenCalled();
        expect(store.setKnownHooks.mock.calls[0][0]).toEqual(hookCatalogNames());
    });
});
//# sourceMappingURL=wiring.test.js.map