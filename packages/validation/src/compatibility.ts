// @oktis-works/validation - Extension Compatibility (BUSI-022 / RULE-semver-compatibility)

import { satisfies, validRange } from 'semver';

export interface CompatibilityManifest {
  name?: unknown;
  version?: unknown;
  type?: unknown;
  compatibility?: { okcms?: unknown } | unknown;
}

export interface CompatibilityIssue {
  code: 'MANIFEST_INCOMPLETE' | 'INVALID_RANGE' | 'INCOMPATIBLE_VERSION';
  message: string;
}

/** Versão do CMS contra a qual a compatibilidade é avaliada. */
export const CMS_VERSION = '0.1.9';

/**
 * Valida o manifesto de uma extensão (plugin|theme) contra a versão do CMS.
 * BUSI-022: manifest deve conter name, version, type e compatibility.okcms;
 * range incompatível bloqueia instalação/carregamento.
 */
export function checkExtensionCompatibility(
  kind: 'plugin' | 'theme',
  manifest: CompatibilityManifest,
  cmsVersion: string = CMS_VERSION
): CompatibilityIssue[] {
  const issues: CompatibilityIssue[] = [];

  if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
    issues.push({ code: 'MANIFEST_INCOMPLETE', message: `manifest.${kind === 'plugin' ? 'json' : 'theme.json'} sem "name"` });
  }
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+/.test(manifest.version)) {
    issues.push({ code: 'MANIFEST_INCOMPLETE', message: `manifest sem "version" semver válida` });
  }
  if (typeof manifest.type !== 'string' || (manifest.type !== 'plugin' && manifest.type !== 'theme')) {
    issues.push({ code: 'MANIFEST_INCOMPLETE', message: `manifest sem "type" válido (plugin|theme)` });
  }

  const compat = (manifest.compatibility ?? {}) as { okcms?: unknown };
  const range = compat.okcms;

  if (typeof range !== 'string' || range.length === 0) {
    issues.push({ code: 'MANIFEST_INCOMPLETE', message: `manifest sem "compatibility.okcms" (range semver do CMS)` });
    return issues;
  }

  if (!validRange(range)) {
    issues.push({ code: 'INVALID_RANGE', message: `"compatibility.okcms" não é um range semver válido: "${range}"` });
    return issues;
  }

  if (!satisfies(cmsVersion, range)) {
    issues.push({
      code: 'INCOMPATIBLE_VERSION',
      message: `${kind} requer OkCMS ${range}, mas a versão atual é ${cmsVersion}`,
    });
  }

  return issues;
}

/** Lança na primeira incompatibilidade — para uso direto em install/load. */
export function assertCompatible(
  kind: 'plugin' | 'theme',
  manifest: CompatibilityManifest,
  cmsVersion: string = CMS_VERSION
): void {
  const issues = checkExtensionCompatibility(kind, manifest, cmsVersion);
  if (issues.length > 0) {
    throw new Error(`Extensão incompatível (${kind}): ${issues.map((i) => i.message).join('; ')}`);
  }
}
