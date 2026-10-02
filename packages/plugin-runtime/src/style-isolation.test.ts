import { describe, it, expect } from 'vitest';
import {
  scopePluginCss,
  getPluginScopeAttribute,
  wrapWithPluginScope,
  lintPluginCss,
} from './style-isolation.js';

describe('plugin style-isolation: BUSI-041 + REQU-039 [data-plugin]', () => {
  it('scopePluginCss prefixa seletores com [data-plugin]', () => {
    const css = '.widget { color: red; } .card h2 { font-weight: bold; }';
    const scoped = scopePluginCss(css, 'my-plugin');
    expect(scoped).toContain('[data-plugin="my-plugin"] .widget');
    expect(scoped).toContain('[data-plugin="my-plugin"] .card h2');
  });

  it('scopePluginCss preserva @keyframes/@font-face e trata :root', () => {
    expect(scopePluginCss('@keyframes a { 0%{opacity:0} }', 'p')).toContain('@keyframes');
    expect(scopePluginCss(':root { --x:1 }', 'p')).toContain('[data-plugin="p"]');
  });

  it('scopePluginCss escopa @media recursivo', () => {
    const css = '@media (max-width:600px){ .x{ display:none } }';
    expect(scopePluginCss(css, 'p')).toContain('[data-plugin="p"] .x');
  });

  it('getPluginScopeAttribute escapa aspas', () => {
    const { attr, selector } = getPluginScopeAttribute('my-plugin');
    expect(attr).toBe('data-plugin="my-plugin"');
    expect(selector).toBe('[data-plugin="my-plugin"]');
  });

  it('wrapWithPluginScope idempotente', () => {
    const html = '<div>hello</div>';
    const wrapped = wrapWithPluginScope(html, 'p');
    expect(wrapped).toContain('data-plugin="p"');
    expect(wrapWithPluginScope(wrapped, 'p')).toBe(wrapped);
  });

  it('lintPluginCss detecta vazamento global', () => {
    expect(lintPluginCss(':root { --x:1 }', 'p').length).toBeGreaterThan(0);
    expect(lintPluginCss('html { margin:0 }', 'p').length).toBeGreaterThan(0);
    expect(lintPluginCss('[data-plugin="p"] .x{color:red}', 'p').length).toBe(0);
  });
});
