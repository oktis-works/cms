import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  scopeCss,
  resolveStyleEngine,
  validateStyleManifest,
  getThemeScopeAttribute,
} from './style-engine.js';

describe('style-engine: BUSI-039 exclusive + BUSI-040 isolation', () => {
  it('scopeCss prefixa seletores com [data-theme]', () => {
    const css = '.site { color: red; } .single h1 { font-size: 2rem; }';
    const scoped = scopeCss(css, 'my-theme');
    expect(scoped).toContain('[data-theme="my-theme"] .site');
    expect(scoped).toContain('[data-theme="my-theme"] .single h1');
  });

  it('scopeCss preserva @keyframes, @font-face e trata :root/html/body', () => {
    expect(scopeCss('@keyframes fade { from { opacity:0 } to { opacity:1 } }', 't')).toContain('@keyframes');
    expect(scopeCss(':root { --x:1 }', 'my-theme')).toContain('[data-theme="my-theme"]');
    expect(scopeCss('html { margin:0 }', 'my-theme')).toContain('[data-theme="my-theme"]');
  });

  it('scopeCss escopa conteúdo de @media recursivamente', () => {
    const css = '@media (min-width: 768px) { .site { color: blue; } }';
    const scoped = scopeCss(css, 't');
    expect(scoped).toContain('@media');
    expect(scoped).toContain('[data-theme="t"] .site');
  });

  it('resolveStyleEngine rejeita isolation=false (BUSI-040)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'theme-'));
    try {
      const manifest: any = { name: 't', stylesConfig: { engine: 'css', isolation: false } };
      const report = resolveStyleEngine({ themesRoot: tmpdir(), themeName: dir.split('/').pop()!, manifest });
      expect(report.errors.join(' ')).toMatch(/isolation=false proibido/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('validateStyleManifest detecta tailwind.config + .scss ambíguo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'theme-'));
    try {
      writeFileSync(join(dir, 'tailwind.config.js'), 'module.exports={}');
      mkdirSync(join(dir, 'styles'), { recursive: true });
      writeFileSync(join(dir, 'styles/main.scss'), '$x:1;');
      const manifest: any = { name: 't', stylesConfig: { engine: 'css' } };
      const errs = validateStyleManifest(manifest, dir);
      expect(errs.join(' ')).toMatch(/ambos tailwind.config/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('getThemeScopeAttribute retorna attr correto', () => {
    const { attr, selector } = getThemeScopeAttribute('my-theme');
    expect(attr).toBe('data-theme="my-theme"');
    expect(selector).toBe('[data-theme="my-theme"]');
  });
});
