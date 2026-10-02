// @oktis-works/cms - Publish Readiness Tests (REQU-020: NPM Publication Readiness)

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '../../..');

function workspacePackages(): string[] {
  return readdirSync(join(root, 'packages'))
    .filter((entry) => statSync(join(root, 'packages', entry)).isDirectory())
    .filter((entry) => existsSync(join(root, 'packages', entry, 'package.json')))
    .sort();
}

function readPkg(pkg: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, 'packages', pkg, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >;
}

describe('NPM Publication Readiness (REQU-020)', () => {
  const packages = workspacePackages();

  it('possui pacotes workspace para publicar', () => {
    expect(packages.length).toBeGreaterThanOrEqual(12);
  });

  for (const pkg of packages) {
    describe(`package "${pkg}"`, () => {
      const manifest = readPkg(pkg);

      it('usa o escopo @oktis-works', () => {
        expect(String(manifest['name'])).toMatch(/^@oktis-works\/[a-z][a-z0-9-]*$/);
      });

      it('possui version semver', () => {
        expect(String(manifest['version'])).toMatch(/^\d+\.\d+\.\d+/);
      });

      it('não é privado (publicável)', () => {
        expect(manifest['private']).not.toBe(true);
      });

      it('declara licença MIT', () => {
        expect(manifest['license']).toBe('MIT');
      });

      it('declara repositório com directory', () => {
        const repo = manifest['repository'] as { url?: string; directory?: string } | undefined;
        expect(repo?.url).toContain('oktis-works/cms');
        expect(repo?.directory).toBe(`packages/${pkg}`);
      });

      it('declara campo files apontando para dist', () => {
        expect(Array.isArray(manifest['files'])).toBe(true);
        expect(manifest['files']).toContain('dist');
      });

      it('declara publishConfig com access public e registry oficial (REQU-020-002)', () => {
        const pc = manifest['publishConfig'] as { access?: string; registry?: string } | undefined;
        expect(pc?.access).toBe('public');
        expect(pc?.registry).toBe('https://registry.npmjs.org/');
      });

      it('expõe entrypoint com types + import (ESM)', () => {
        const exportsMap = manifest['exports'] as
          | Record<string, { types?: string; import?: string }>
          | undefined;
        const entry = exportsMap?.['.'];
        expect(entry?.types).toBeTruthy();
        expect(entry?.import).toContain('.js');
        expect(String(manifest['type'])).toBe('module');
      });
    });
  }

  it('raiz fixa engines e packageManager (reprodutibilidade)', () => {
    const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(rootPkg['engines']).toMatchObject({ node: '>=20.0.0' });
    expect(String(rootPkg['packageManager'])).toMatch(/^bun@\d+/);
  });
});
