// @oktis-works/core - Diretórios de extensões do projeto (env unificada)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveExtensionDirectory } from './project-directories.js';
const ENV_KEYS = ['OKCMS_THEMES_DIR', 'THEMES_DIR', 'OKCMS_PLUGINS_DIR'];
const saved = {};
beforeEach(() => {
    for (const key of ENV_KEYS)
        saved[key] = process.env[key];
});
afterEach(() => {
    for (const key of ENV_KEYS) {
        if (saved[key] === undefined)
            delete process.env[key];
        else
            process.env[key] = saved[key];
    }
});
describe('resolveExtensionDirectory — env é a fonte única', () => {
    it('OKCMS_THEMES_DIR (canônico) resolve o tema', () => {
        process.env['OKCMS_THEMES_DIR'] = '/abs/meus-temas';
        expect(resolveExtensionDirectory('theme', '/projeto')).toBe('/abs/meus-temas');
    });
    it('THEMES_DIR (alias do web runtime/e2e) resolve o MESMO diretório', () => {
        process.env['THEMES_DIR'] = '/abs/meus-temas';
        expect(resolveExtensionDirectory('theme', '/projeto')).toBe('/abs/meus-temas');
    });
    it('canônico vence o alias quando os dois existem', () => {
        process.env['OKCMS_THEMES_DIR'] = '/canonico';
        process.env['THEMES_DIR'] = '/alias';
        expect(resolveExtensionDirectory('theme', '/projeto')).toBe('/canonico');
    });
    it('sem env cai no default ./themes do cwd', () => {
        expect(resolveExtensionDirectory('theme', '/projeto')).toBe('/projeto/themes');
    });
    it('alias não existe para plugin (só OKCMS_PLUGINS_DIR)', () => {
        process.env['OKCMS_PLUGINS_DIR'] = '/abs/meus-plugins';
        expect(resolveExtensionDirectory('plugin', '/projeto')).toBe('/abs/meus-plugins');
    });
    it('plugin sem env cai no default ./plugins do cwd', () => {
        expect(resolveExtensionDirectory('plugin', '/projeto')).toBe('/projeto/plugins');
    });
});
//# sourceMappingURL=project-directories.test.js.map