import { describe, it, expect, beforeEach } from 'vitest';
describe('ThemeRenderer', () => {
    let ThemeRenderer;
    beforeEach(async () => {
        const mod = await import('./renderer.js');
        ThemeRenderer = mod.ThemeRenderer;
    });
    it('should create a renderer instance', () => {
        const renderer = new ThemeRenderer({ themePath: '/mock/path' });
        expect(renderer).toBeDefined();
    });
    it('should have render method', () => {
        const renderer = new ThemeRenderer({ themePath: '/mock/path' });
        expect(typeof renderer.render).toBe('function');
    });
});
describe('ThemeRenderer — cache de templates', () => {
    it('eviction FIFO mantém o render correto mesmo com muitos templates únicos', async () => {
        const { ThemeRenderer } = await import('./renderer.js');
        const renderer = new ThemeRenderer();
        // acima do teto (200): o cache precisa evicionar sem perder corretude
        for (let i = 0; i < 260; i++) {
            const html = renderer.renderString(`<p>t${i} {{valor}}</p>`, { valor: String(i) });
            expect(html).toBe(`<p>t${i} ${i}</p>`);
        }
        // template do início da varredura ainda renderiza certo após as evictions
        expect(renderer.renderString('<p>t0 {{valor}}</p>', { valor: '0' })).toBe('<p>t0 0</p>');
    });
});
//# sourceMappingURL=renderer.test.js.map