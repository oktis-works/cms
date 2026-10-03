// @oktis-works/admin - Reescrita do aviso "Server listening on" do @astrojs/node
//
// O adapter decide o protocolo com `server instanceof https.Server`, e sob Bun
// isso responde true até pra http.Server — o log sai "https://" mesmo o
// servidor sendo HTTP puro (quem copia a URL leva ERR_SSL_PROTOCOL_ERROR).
// Em WSL o "network:" aponta um IP interno (ex.: 10.255.255.254) que não
// responde do Windows (ERR_CONNECTION_TIMED_OUT). Funções puras, testadas em
// apps/admin/tests/listen-log.test.ts.

const LISTEN_LOCAL_NETWORK = /^[ \t]+(?:local|network):/m;

/** true se o texto é (parte de) o aviso de listen do adapter. */
export function looksLikeListenLog(text) {
  return text.includes('Server listening on') || LISTEN_LOCAL_NETWORK.test(text);
}

/**
 * Reescreve um chunk do aviso de listen:
 *   - `https://` → `http://` (protocolo real do servidor standalone);
 *   - em WSL, remove a linha `network:` (IP interno inalcançável do Windows);
 *     um chunk que SÓ é a linha `network:` vira null (suprima a escrita).
 * Texto fora do aviso volta intacto.
 */
export function rewriteListenChunk(text, isWsl) {
  if (!looksLikeListenLog(text)) return text;
  const fixed = text.replace(/https:\/\//g, 'http://');
  if (!isWsl) return fixed;
  if (/^[ \t]*network:/m.test(fixed) && !fixed.includes('local:')) return null;
  return fixed.replace(/\n[ \t]*network:[^\n]*/g, '');
}

/**
 * Substitui owner[name] por um wrapper que reescreve os argumentos-string.
 * O logger do Astro escreve o listen via console.info (nível info) e erros via
 * console.error — embrulha todos os métodos de log pra não perder nenhum.
 */
export function wrapLogMethod(owner, name, isWsl) {
  const original = owner[name];
  const wrapped = (...args) => {
    const out = [];
    let dropped = 0;
    for (const arg of args) {
      if (typeof arg !== 'string') {
        out.push(arg);
        continue;
      }
      const rewritten = rewriteListenChunk(arg, isWsl);
      if (rewritten === null) {
        dropped++;
        continue;
      }
      out.push(rewritten);
    }
    if (args.length > 0 && out.length === 0 && dropped > 0) return undefined;
    return original.apply(owner, out);
  };
  owner[name] = wrapped;
  return wrapped;
}

/** Instala a reescrita em log/info/warn/error do console-like dado. */
export function installListenLogRewrite(consoleLike, isWsl) {
  for (const name of ['log', 'info', 'warn', 'error']) {
    if (typeof consoleLike[name] === 'function') wrapLogMethod(consoleLike, name, isWsl);
  }
}
