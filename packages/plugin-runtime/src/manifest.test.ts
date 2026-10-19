// @oktis-works/plugin-runtime - Validação do manifesto v2
//
// Item E1 do plugin-parity-plan: valida o bloco `admin` (FEAT-098/DECI-027) —
// identidade obrigatória, capability obrigatória em menus, screens não vazio
// em metaBoxes e valores conhecidos de context/priority/render/level.

import { describe, it, expect } from 'vitest';
import { validateManifestV2, readPluginManifest } from './manifest.js';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const base = { name: 'p', version: '1.0.0', main: 'index.js', manifestVersion: 2 };

describe('validateManifestV2 - admin (FEAT-098)', () => {
  it('aceita um bloco admin válido (menus com capability, widgets, metaboxes, notices, colunas)', () => {
    const issues = validateManifestV2({
      ...base,
      admin: {
        menuPages: [{ slug: 'tools', label: 'Tools', capability: 'manage_options' }],
        submenuPages: [{ parentSlug: 'tools', slug: 'audit', label: 'Audit', capability: 'read' }],
        dashboardWidgets: [{ id: 'w1', title: 'W', componentId: 'p:W' }],
        metaBoxes: [{ id: 'm1', title: 'M', componentId: 'p:M', screens: ['post'], context: 'side', priority: 'high' }],
        notices: [{ level: 'info', message: 'Olá' }],
        columns: [{ contentType: 'post', key: 'visits', label: 'Visits' }],
        columnRenderers: [{ contentType: 'post', key: 'visits', componentId: 'p:Cell' }],
        actionLinks: [{ label: 'Docs', url: 'https://example.com' }],
        editors: [{ id: 'blocks', componentId: 'p:BlocksEditor', mode: 'replace-body', screens: ['post'], priority: 1 }],
      },
    });
    expect(issues).toEqual([]);
  });

  it('rejects admin that is not an object', () => {
    expect(validateManifestV2({ ...base, admin: 'nope' })).toContain('admin must be an object');
  });

  it('exige capability em menuPages e submenuPages', () => {
    const issues = validateManifestV2({
      ...base,
      admin: {
        menuPages: [{ slug: 'tools', label: 'Tools' }],
        submenuPages: [{ slug: 'audit', label: 'Audit', capability: 'read' }],
      },
    });
    expect(issues.some((issue) => issue.includes('admin.menuPages[0]'))).toBe(true);
    expect(issues.some((issue) => issue.includes('admin.submenuPages[0]'))).toBe(true);
  });

  it('exige screens não vazio em metaBoxes e valida context/priority', () => {
    const issues = validateManifestV2({
      ...base,
      admin: {
        metaBoxes: [
          { id: 'm1', title: 'M', componentId: 'p:M', screens: [] },
          { id: 'm2', title: 'M2', componentId: 'p:M2', screens: ['post'], context: 'footer', priority: 'urgent' },
        ],
      },
    });
    expect(issues.some((issue) => issue.includes('admin.metaBoxes[0].screens'))).toBe(true);
    expect(issues.some((issue) => issue.includes('admin.metaBoxes[1].context'))).toBe(true);
    expect(issues.some((issue) => issue.includes('admin.metaBoxes[1].priority'))).toBe(true);
  });

  it('valida level de notices e render de dashboardWidgets', () => {
    const issues = validateManifestV2({
      ...base,
      admin: {
        notices: [{ level: 'critical', message: 'X' }],
        dashboardWidgets: [{ id: 'w1', title: 'W', componentId: 'p:W', render: 'html' }],
      },
    });
    expect(issues.some((issue) => issue.includes('admin.notices[0].level'))).toBe(true);
    expect(issues.some((issue) => issue.includes('admin.dashboardWidgets[0].render'))).toBe(true);
  });

  it('exige identidade em columns/columnRenderers/actionLinks', () => {
    const issues = validateManifestV2({
      ...base,
      admin: {
        columns: [{ contentType: 'post', label: 'Sem key' }],
        columnRenderers: [{ contentType: 'post', key: 'k' }],
        actionLinks: [{ label: 'Sem url' }],
      },
    });
    expect(issues.some((issue) => issue.includes('admin.columns[0]'))).toBe(true);
    expect(issues.some((issue) => issue.includes('admin.columnRenderers[0]'))).toBe(true);
    expect(issues.some((issue) => issue.includes('admin.actionLinks[0]'))).toBe(true);
  });

  it('validates admin.editors entries (identity, screens, mode, priority)', () => {
    const issues = validateManifestV2({
      ...base,
      admin: {
        editors: [
          { componentId: 'p:Editor', mode: 'replace-body', screens: ['post'] },
          { id: 'e2', componentId: 'p:E2', mode: 'sidebar', screens: [], priority: 'high' },
        ],
      },
    });
    expect(issues.some((issue) => issue.includes('admin.editors[0]'))).toBe(true);
    expect(issues.some((issue) => issue.includes('admin.editors[1].screens'))).toBe(true);
    expect(issues.some((issue) => issue.includes('admin.editors[1].mode'))).toBe(true);
    expect(issues.some((issue) => issue.includes('admin.editors[1].priority'))).toBe(true);
  });
});

describe('readPluginManifest - modo leniente', () => {
  it('não bloqueia o boot por admin malformado (só avisa)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bl-manifest-admin-'));
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'manifest.json'),
        JSON.stringify({ ...base, admin: { menuPages: [{ slug: 'x', label: 'X' }] } })
      );
      const { manifest, issues } = await readPluginManifest(dir);
      expect(manifest?.name).toBe('p');
      expect(issues).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
