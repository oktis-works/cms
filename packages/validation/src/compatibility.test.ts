// @oktis-works/validation - Extension Compatibility Tests (BUSI-022, RULE-semver-compatibility, REQU-023)

import { describe, it, expect } from 'vitest';
import { checkExtensionCompatibility, assertCompatible, CMS_VERSION } from './compatibility.js';

const valid = {
  name: 'meu-plugin',
  version: '1.2.3',
  type: 'plugin' as const,
  // range derivado da versão atual: o teste valida a SEMÂNTICA da checagem,
  // não um número fixo — assim não quebra a cada release do CMS.
  compatibility: { okcms: `^${CMS_VERSION}` },
};

describe('checkExtensionCompatibility (BUSI-022)', () => {
  it('aceita manifest completo e compatível', () => {
    expect(checkExtensionCompatibility('plugin', valid)).toEqual([]);
  });

  it('exige name, version, type e compatibility.okcms', () => {
    const issues = checkExtensionCompatibility('theme', {});
    expect(issues.map((i) => i.code).filter((c) => c === 'MANIFEST_INCOMPLETE').length).toBe(4);
  });

  it('bloqueia range semver inválido', () => {
    const issues = checkExtensionCompatibility('plugin', {
      ...valid,
      compatibility: { okcms: 'latest || *-oops' },
    });
    expect(issues[0]!.code).toBe('INVALID_RANGE');
  });

  it('bloqueia versão do CMS fora do range declarado', () => {
    const issues = checkExtensionCompatibility('plugin', {
      ...valid,
      compatibility: { okcms: '^9.9.0' },
    });
    expect(issues[0]!.code).toBe('INCOMPATIBLE_VERSION');
    expect(issues[0]!.message).toContain(CMS_VERSION);
  });

  it('respeita ranges parciais (^, ~, >=)', () => {
    // derivados de CMS_VERSION: ^ e ~ valem para a janela do minor atual
    for (const prefix of ['^', '~', '>=']) {
      const issues = checkExtensionCompatibility('plugin', {
        ...valid,
        compatibility: { okcms: `${prefix}${CMS_VERSION}` },
      });
      expect(issues).toEqual([]);
    }
  });

  it('assertCompatible lança com mensagem agregada', () => {
    expect(() =>
      assertCompatible('plugin', {
        ...valid,
        compatibility: { okcms: '^99.0.0' },
      })
    ).toThrow(new RegExp(`incompatível \\(plugin\\): .*${CMS_VERSION.replace(/\./g, '\\.')}`));

    expect(() => assertCompatible('theme', valid)).not.toThrow();
  });
});
