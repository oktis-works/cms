// @oktis-works/plugin-runtime - Plugin loading via node_modules layout (TASK-038)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { PluginLoader } from './loader.js';
describe('NPM flow integration: PluginLoader (node_modules layout)', () => {
    let pluginsDir;
    beforeEach(() => {
        pluginsDir = mkdtempSync(join(tmpdir(), 'bl-plugins-'));
    });
    afterEach(() => {
        rmSync(pluginsDir, { recursive: true, force: true });
    });
    function writePlugin(name, mainFile, code, manifest) {
        const dir = join(pluginsDir, name);
        mkdirSync(dir, { recursive: true });
        // Convenção node_modules: o loader descobre plugins via package.json
        writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: mainFile, ...manifest }));
        mkdirSync(join(dir, mainFile, '..'), { recursive: true });
        writeFileSync(join(dir, mainFile), code);
    }
    it('descobre plugins válidos e ignora diretórios sem manifest', async () => {
        writePlugin('plugin-a', 'index.js', 'export default { start() {} };');
        writePlugin('plugin-b', 'dist/main.js', 'module.exports = { stop() {} };');
        writeFileSync(join(pluginsDir, 'sem-manifest-placeholder'), '');
        mkdirSync(join(pluginsDir, 'sem-package'));
        const loader = new PluginLoader(pluginsDir);
        const discovered = await loader.discoverPlugins();
        expect(discovered).toHaveLength(2);
        expect(discovered.map((entry) => entry.manifest.name).sort()).toEqual(['plugin-a', 'plugin-b']);
    });
    it('carrega módulo ESM do entry point declarado', async () => {
        writePlugin('esm-plugin', 'index.js', 'export default { hello: () => "mundo" };');
        const loader = new PluginLoader(pluginsDir);
        const discovered = await loader.discoverPlugins();
        const target = discovered.find((entry) => entry.manifest.name === 'esm-plugin');
        const loaded = await loader.loadPlugin(target.manifest, target.path);
        expect(loaded.loaded).toBe(true);
        const api = loaded.api;
        expect(api.hello()).toBe('mundo');
    }, 15000);
    it('ordena dependências topologicamente (dependente depois da dependência)', async () => {
        writePlugin('core-lib', 'index.js', 'export default {};', {
            dependencies: [],
        });
        writePlugin('depends-on-core', 'index.js', 'export default {};', {
            dependencies: [{ name: 'core-lib', version: '*', required: true }],
        });
        const loader = new PluginLoader(pluginsDir);
        const discovered = await loader.discoverPlugins();
        const levels = loader.resolveDependencies(discovered);
        const flat = levels.flat().map((entry) => entry.manifest.name);
        expect(flat.indexOf('core-lib')).toBeLessThan(flat.indexOf('depends-on-core'));
    });
});
// Garante que pathToFileURL está importado para uso em loaders futuros (windows-safe)
void pathToFileURL;
//# sourceMappingURL=loader.node-modules.test.js.map