import { describe, it, expect, beforeEach } from 'vitest';
describe('PluginSandbox', () => {
    let PluginSandbox;
    beforeEach(async () => {
        const mod = await import('./sandbox.js');
        PluginSandbox = mod.PluginSandbox;
    });
    it('should create a sandbox with default config', () => {
        const sandbox = new PluginSandbox();
        expect(sandbox).toBeDefined();
    });
    it('should create a sandbox with custom config', () => {
        const sandbox = new PluginSandbox({
            timeoutMs: 10000,
            maxMemoryMb: 256,
            allowedPermissions: ['content.read', 'media.upload'],
        });
        expect(sandbox).toBeDefined();
    });
    it('should load a plugin via sandbox', () => {
        const sandbox = new PluginSandbox({
            allowedPermissions: ['content.read'],
        });
        const manifest = {
            name: 'test-plugin',
            version: '1.0.0',
            main: 'index.js',
            permissions: ['content.read'],
        };
        const api = {
            registerHook: () => { },
            addRoute: () => { },
            addContentField: () => { },
            getSetting: async () => null,
            setSetting: async () => { },
            getTenant: async () => ({ id: '1', name: 'Test', slug: 'test' }),
            getUser: async () => ({ id: '1', email: 'test@test.com', name: 'Test' }),
            query: async () => [],
            emit: async () => { },
        };
        const loaded = sandbox.loadPlugin(manifest, api);
        expect(loaded).toBeDefined();
        expect(loaded.loaded).toBe(true);
    });
    it('should reject plugin with unauthorized permissions', () => {
        const sandbox = new PluginSandbox({
            allowedPermissions: [],
        });
        const manifest = {
            name: 'test-plugin',
            version: '1.0.0',
            main: 'index.js',
            permissions: ['content.read'],
        };
        const api = {
            registerHook: () => { },
            addRoute: () => { },
            addContentField: () => { },
            getSetting: async () => null,
            setSetting: async () => { },
            getTenant: async () => ({ id: '1', name: 'Test', slug: 'test' }),
            getUser: async () => ({ id: '1', email: 'test@test.com', name: 'Test' }),
            query: async () => [],
            emit: async () => { },
        };
        expect(() => sandbox.loadPlugin(manifest, api)).toThrow('Plugin permission denied');
    });
});
//# sourceMappingURL=sandbox.test.js.map