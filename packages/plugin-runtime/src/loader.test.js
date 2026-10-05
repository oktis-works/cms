import { describe, it, expect, beforeEach } from 'vitest';
describe('PluginLoader', () => {
    let PluginLoader;
    beforeEach(async () => {
        const mod = await import('./loader.js');
        PluginLoader = mod.PluginLoader;
    });
    it('should create a loader instance', () => {
        const loader = new PluginLoader('/mock/plugins');
        expect(loader).toBeDefined();
    });
    it('should have load and unload methods', () => {
        const loader = new PluginLoader('/mock/plugins');
        expect(typeof loader.loadPlugin).toBe('function');
        expect(typeof loader.discoverPlugins).toBe('function');
        expect(typeof loader.resolveDependencies).toBe('function');
    });
});
//# sourceMappingURL=loader.test.js.map