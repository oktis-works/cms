// @oktis-works/theme-runtime - Descoberta de templates do projeto (fonte única)

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProjectTemplateResolver } from './template-resolver.js';

const roots: string[] = [];

function makeRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'okcms-projtpl-'));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of roots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('createProjectTemplateResolver — cadeia ativo → _shared → default', () => {
  it('lê do tema ativo quando o arquivo existe nele', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'mytheme'), { recursive: true });
    writeFileSync(join(root, 'mytheme', 'single.astro'), 'ATIVE');

    const r = createProjectTemplateResolver(root, 'mytheme');
    expect(r.templateChain).toEqual(['mytheme', '_shared', 'default']);
    expect(r.exists('single.astro')).toBe(true);
    expect(r.read('single.astro')).toBe('ATIVE');
  });

  it('cai no _shared quando o ativo não tem o template', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'mytheme'), { recursive: true });
    mkdirSync(join(root, '_shared'), { recursive: true });
    writeFileSync(join(root, '_shared', 'partial.astro'), 'SHARED');

    const r = createProjectTemplateResolver(root, 'mytheme');
    expect(r.exists('partial.astro')).toBe(true);
    expect(r.read('partial.astro')).toBe('SHARED');
    expect(r.resolvePathFor('partial.astro')).toContain('_shared');
  });

  it('cai no default quando só o default tem', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'default'), { recursive: true });
    writeFileSync(join(root, 'default', 'single.astro'), 'FLOOR');

    const r = createProjectTemplateResolver(root, 'mytheme');
    expect(r.read('single.astro')).toBe('FLOOR');
  });

  it('prioridade: ativo vence _shared e default no mesmo arquivo', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'mytheme'), { recursive: true });
    mkdirSync(join(root, '_shared'), { recursive: true });
    mkdirSync(join(root, 'default'), { recursive: true });
    writeFileSync(join(root, 'mytheme', 'single.astro'), 'ACTIVE');
    writeFileSync(join(root, '_shared', 'single.astro'), 'SHARED');
    writeFileSync(join(root, 'default', 'single.astro'), 'FLOOR');

    expect(createProjectTemplateResolver(root, 'mytheme').read('single.astro')).toBe('ACTIVE');
  });

  it('arquivo ausente em qualquer tema → null / exists false', () => {
    const root = makeRoot();
    const r = createProjectTemplateResolver(root, 'mytheme');
    expect(r.exists('nada.astro')).toBe(false);
    expect(r.read('nada.astro')).toBeNull();
    expect(r.resolvePathFor('nada.astro')).toBeNull();
  });

  it('segurança: file com .. ou absoluto e tema com nome inválido nunca resolvem', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'default'), { recursive: true });
    writeFileSync(join(root, 'default', 'x.astro'), 'X');

    const r = createProjectTemplateResolver(root, 'default');
    expect(r.exists('../secrets.env')).toBe(false);
    expect(r.exists('/etc/passwd')).toBe(false);
    expect(r.read('../secrets.env')).toBeNull();
    // tema com nome inválido é simplesmente removido da cadeia (não explode)
    const broken = createProjectTemplateResolver(root, '../evil');
    expect(broken.templateChain).toEqual(['_shared', 'default']);
    expect(broken.read('x.astro')).toBe('X');
  });
});
