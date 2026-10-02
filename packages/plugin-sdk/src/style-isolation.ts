// @oktis-works/plugin-sdk - Style Isolation helpers (thin wrapper para evitar ciclo)
// Implementação canônica em @oktis-works/plugin-runtime/src/style-isolation.ts
export function scopePluginCss(css: string, pluginName: string, prefix = `[data-plugin="${pluginName}"]`): string {
  // delega para runtime quando disponível; fallback inline idem ao runtime
  const isExcluded = (s: string) => s.trim().startsWith('@keyframes') || s.trim().startsWith('@font-face');
  let out = '';
  let i = 0;
  const len = css.length;
  while (i < len) {
    if (css[i]?.trim() === '') { out += css[i++]; continue; }
    if (css.startsWith('/*', i)) { const end = css.indexOf('*/', i+2); const c = end===-1? css.slice(i): css.slice(i,end+2); out+=c; i+=c.length; continue; }
    if (css[i]==='@'){ const semi=css.indexOf(';',i), brace=css.indexOf('{',i); if(semi!==-1 && (brace===-1 || semi<brace)){ out+=css.slice(i,semi+1); i=semi+1; continue; } }
    const braceIdx = css.indexOf('{', i);
    if (braceIdx===-1){ out+=css.slice(i); break; }
    const selectorPart = css.slice(i, braceIdx).trim();
    let depth=0, endIdx=-1; for(let k=braceIdx;k<len;k++){ if(css[k]==='{')depth++; else if(css[k]==='}'){depth--; if(depth===0){endIdx=k; break;}}}
    if(endIdx===-1){ out+=css.slice(i); break; }
    const body = css.slice(braceIdx, endIdx+1);
    if(isExcluded(selectorPart)){ out+=css.slice(i,endIdx+1); }
    else if(selectorPart.startsWith('@media')||selectorPart.startsWith('@supports')){ const inner=css.slice(braceIdx+1,endIdx); out+=`${selectorPart} {${scopePluginCss(inner, pluginName, prefix)}}`; }
    else if(selectorPart.startsWith('@')){ out+=`${selectorPart} {${css.slice(braceIdx+1,endIdx)}}`; }
    else {
      const sels = selectorPart.split(',').map(s=>s.trim()).filter(Boolean);
      const scoped = sels.map(sel=> sel.includes(prefix)? sel : (sel===':root'||sel==='html'||sel==='body'? prefix : sel.match(/:root|\bhtml\b|\bbody\b/)? sel.replace(':root',prefix).replace(/\bhtml\b/,prefix).replace(/\bbody\b/,prefix) : `${prefix} ${sel}`));
      out+=`${scoped.join(', ')}${body}`;
    }
    i=endIdx+1;
  }
  return out || css;
}
export function getPluginScopeAttribute(pluginName: string){ const e=pluginName.replace(/"/g,'&quot;'); return {attr:`data-plugin="${e}"`, selector:`[data-plugin="${e}"]`, dataAttr:'data-plugin'}; }
export function wrapWithPluginScope(html: string, pluginName: string){ const {attr}=getPluginScopeAttribute(pluginName); return html.includes('data-plugin=')? html : `<div ${attr}>${html}</div>`; }
