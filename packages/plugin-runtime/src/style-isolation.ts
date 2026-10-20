// @oktis-works/plugin-runtime - Plugin style isolation [data-plugin="name"] — mandatory
// Equivalente ao isolamento de tema [data-theme], mas para plugins (admin + site).
// BUSI plugin-style-isolation: todo CSS injetado por plugin deve ser escopado.

/**
 * Escopa CSS sob [data-plugin="name"] — isolamento fino para plugins.
 * Cobre seletores, @media/@supports recursivo, preserva @keyframes/@font-face.
 * No PostCSS dependency (runtime fallback); for builds use the same algorithm as theme-runtime.
 */
export function scopePluginCss(css: string, pluginName: string, prefix = `[data-plugin="${pluginName}"]`): string {
  const isExcludedAtRule = (selector: string) => {
    const s = selector.trim();
    return s.startsWith('@keyframes') || s.startsWith('@font-face') || s.startsWith('@import');
  };
  const shouldReplaceRoot = (sel: string) => /:root|\bhtml\b|\bbody\b/.test(sel);
  let out = '';
  let i = 0;
  const len = css.length;
  while (i < len) {
    if (css[i]?.trim() === '') { out += css[i++]; continue; }
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2);
      const comment = end === -1 ? css.slice(i) : css.slice(i, end + 2);
      out += comment;
      i += comment.length;
      continue;
    }
    if (css[i] === '@') {
      const semi = css.indexOf(';', i);
      const brace = css.indexOf('{', i);
      if (semi !== -1 && (brace === -1 || semi < brace)) {
        out += css.slice(i, semi + 1);
        i = semi + 1;
        continue;
      }
    }
    const braceIdx = css.indexOf('{', i);
    if (braceIdx === -1) { out += css.slice(i); break; }
    const selectorPart = css.slice(i, braceIdx).trim();
    let depth = 0;
    let endIdx = -1;
    for (let k = braceIdx; k < len; k++) {
      if (css[k] === '{') depth++;
      else if (css[k] === '}') { depth--; if (depth === 0) { endIdx = k; break; } }
    }
    if (endIdx === -1) { out += css.slice(i); break; }
    const block = css.slice(i, endIdx + 1);
    const body = css.slice(braceIdx, endIdx + 1);
    if (isExcludedAtRule(selectorPart)) {
      out += block;
    } else if (selectorPart.startsWith('@media') || selectorPart.startsWith('@supports') || selectorPart.startsWith('@layer')) {
      const inner = css.slice(braceIdx + 1, endIdx);
      out += `${selectorPart} {${scopePluginCss(inner, pluginName, prefix)}}`;
    } else if (selectorPart.startsWith('@')) {
      const inner = css.slice(braceIdx + 1, endIdx);
      out += `${selectorPart} {${inner}}`;
    } else {
      const selectors = selectorPart.split(',').map(s => s.trim()).filter(Boolean);
      const scoped = selectors.map(sel => {
        if (sel.startsWith('@')) return sel;
        if (sel.includes(prefix)) return sel;
        if (shouldReplaceRoot(sel)) {
          if (sel === ':root' || sel === 'html' || sel === 'body') return prefix;
          return sel.replace(':root', prefix).replace(/\bhtml\b/, prefix).replace(/\bbody\b/, prefix);
        }
        return `${prefix} ${sel}`;
      });
      out += `${scoped.join(', ')}${body}`;
    }
    i = endIdx + 1;
  }
  if (!out.trim() && css.trim()) return `${prefix} { ${css} }`;
  return out || css;
}

export function getPluginScopeAttribute(pluginName: string): { attr: string; selector: string; dataAttr: string } {
  const escaped = pluginName.replace(/"/g, '&quot;');
  return { attr: `data-plugin="${escaped}"`, selector: `[data-plugin="${escaped}"]`, dataAttr: 'data-plugin' };
}

/**
 * Envelopa HTML de plugin com [data-plugin] para garantir escopo no DOM.
 * Idempotent: when it already contains data-plugin, returns it untouched.
 */
export function wrapWithPluginScope(html: string, pluginName: string): string {
  const { attr } = getPluginScopeAttribute(pluginName);
  if (html.includes('data-plugin=')) return html;
  // prefere wrapper <div data-plugin="...">
  return `<div ${attr}>${html}</div>`;
}

/**
 * Validates that plugin CSS has no obvious global leak.
 * Retorna warnings se encontrar :root/html/body sem escopo ou * global sem prefix.
 */
export function lintPluginCss(css: string, pluginName: string): string[] {
  const warnings: string[] = [];
  const prefix = `[data-plugin="${pluginName}"]`;
  if (css.includes(':root') && !css.includes(prefix)) warnings.push('CSS contains unscoped :root [data-plugin] — will be remapped to the prefix');
  if (/\bhtml\s*\{/.test(css) || /\bbody\s*\{/.test(css)) warnings.push('CSS contains global html/body — will be remapped to [data-plugin]');
  return warnings;
}
