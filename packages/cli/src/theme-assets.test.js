// @oktis-works/cms - Assets embutidos do tema default
import { Buffer } from 'node:buffer';
import { describe, it, expect } from 'vitest';
import { DEFAULT_THEME_FILES, DEFAULT_THEME_BINARY_FILES, DEFAULT_THEME_MANIFEST, THEME_TEMPLATE_FILES } from './theme-assets.js';
describe('DEFAULT_THEME_FILES (tema default embutido no init)', () => {
    const manifest = JSON.parse(DEFAULT_THEME_MANIFEST);
    it('manifesto tem name/version/type/compatibilidade legível pelo service', () => {
        expect(manifest['name']).toBe('default');
        expect(manifest['version']).toBe('0.1.0');
        expect(manifest['type']).toBe('theme');
        expect(manifest['provides']['layouts']).toEqual([
            'home', 'index', 'single', 'page', 'archive', '404',
        ]);
    });
    it('traz a hierarquia completa de templates .astro na raiz', () => {
        for (const file of ['home.astro', 'index.astro', 'single.astro', 'page.astro', 'archive.astro', '404.astro']) {
            expect(Object.keys(THEME_TEMPLATE_FILES)).toContain(file);
            expect(THEME_TEMPLATE_FILES[file].startsWith('<main')).toBe(true);
        }
    });
    it('templates usam o contexto real do runtime (items, site, content) — nunca posts', () => {
        expect(THEME_TEMPLATE_FILES['home.astro']).toContain('{{#each items}}');
        expect(THEME_TEMPLATE_FILES['home.astro']).not.toContain('posts');
        expect(THEME_TEMPLATE_FILES['single.astro']).toContain('{{content.title}}');
        expect(THEME_TEMPLATE_FILES['index.astro']).toContain('{{{content.html}}}');
    });
    it('inclui dist/theme.css servível (caminho que o web linka)', () => {
        expect(DEFAULT_THEME_FILES['dist/theme.css']).toContain('--brand');
        expect(Object.keys(DEFAULT_THEME_FILES)).toContain('theme.json');
    });
    it('cobre exatamente manifesto + 6 templates + css (screenshot é binário à parte)', () => {
        expect(Object.keys(DEFAULT_THEME_FILES).sort()).toEqual(['404.astro', 'archive.astro', 'dist/theme.css', 'home.astro', 'index.astro', 'theme.json', 'page.astro', 'single.astro'].sort());
        expect(Object.keys(DEFAULT_THEME_BINARY_FILES)).toEqual(['screenshot.png']);
    });
    it('manifest declara compatibility.okcms (BUSI-022 — theme:install exige)', () => {
        expect(manifest['compatibility']['okcms']).toMatch(/^\^\d+\.\d+\.\d+$/);
    });
    it('manifest declara screenshots para o preview do admin e o PNG decodifica válido', () => {
        expect(manifest['screenshots']).toEqual(['screenshot.png']);
        const decoded = Buffer.from(DEFAULT_THEME_BINARY_FILES['screenshot.png'], 'base64');
        // magic number PNG + dimensões 600x400 (IHDR)/big-endian
        expect(decoded.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        expect(decoded.readUInt32BE(16)).toBe(600);
        expect(decoded.readUInt32BE(20)).toBe(400);
    });
});
//# sourceMappingURL=theme-assets.test.js.map