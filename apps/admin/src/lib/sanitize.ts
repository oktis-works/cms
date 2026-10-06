/**
 * Sanitizador de HTML em allowlist para pontos de injeção (innerHTML).
 *
 * O admin injeta HTML apenas no conteúdo das abas de ajuda (HelpTabs), que
 * vem do i18n — mas todo innerHTML passa por aqui por defesa em profundidade.
 *
 * Garantias:
 * - Allowlist de tags e atributos (script/style/svg/iframe/form são removidos,
 *   incluindo o conteúdo de tags de texto bruto como <script> e <style>).
 * - Atributos de evento (on*), style e demais fora da allowlist são descartados.
 * - href/src têm o protocolo validado DEPOIS de decodificar entidades e remover
 *   tab/newline — o valor emitido é re-escapado a partir do valor decodificado,
 *   de modo que o que o navegador decodifica é exatamente o que foi validado
 *   (bloqueia `javascript:`, `&#106;avascript:`, `javascript&colon;`, etc).
 * - Texto é escapado (& < >), preservando entidades já válidas.
 * - Tags de fechamento sem âncora são ignoradas: conteúdo malicioso não consegue
 *   "escapar" do container nem desbalancear a árvore (o quebra-cabeça de abas
 *   e widgets continua íntegro).
 *
 * Puro JavaScript, sem APIs de DOM: roda igual no SSR (Node) e no navegador.
 */

/** Tags permitidas (conteúdo rico simples: ajuda, títulos, listas, links). */
const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'dd', 'div', 'dl', 'dt',
  'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
  'i', 'img', 'li', 'ol', 'p', 'pre', 'q', 's', 'span', 'strong', 'sub',
  'sup', 'u', 'ul',
]);

/** Tags vazias (emitidas com fechamento próprio, nunca empilhadas). */
const VOID_TAGS = new Set(['br', 'hr', 'img']);

/**
 * Tags cujo conteúdo é texto bruto no HTML. Ao encontrá-las abertas, todo o
 * miolo é descartado até o fechamento correspondente (senão, o conteúdo do
 * <script> viraria texto visível ou vetor de parse).
 */
const RAW_TEXT_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'svg', 'math',
  'textarea', 'title', 'noscript', 'template',
]);

/** Atributos permitidos (globais; validação extra por atributo abaixo). */
const ALLOWED_ATTRS = new Set([
  'class', 'title', 'alt', 'width', 'height', 'href', 'src', 'target', 'rel',
]);

/** Esquemas aceitos em href (links externos, e-mail, telefone). */
const HREF_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

/** Esquemas aceitos em src (somente rede). */
const SRC_SCHEMES = new Set(['http', 'https']);

/** Entidades nomeadas relevantes (as que poderiam alterar a validação de URL). */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  colon: ':',
  tab: '\t',
  newline: '\n',
  sol: '/',
  lpar: '(',
  rpar: ')',
  num: '#',
  period: '.',
  excl: '!',
  comma: ',',
};

/** Decodifica referências numéricas e nomeadas (uma passada, como o navegador). */
function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);?/g, (_m, hex: string) => fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_m, dec: string) => fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]{1,30});?/g, (m, name: string) => {
      const key = name in NAMED_ENTITIES ? name : name.toLowerCase();
      return NAMED_ENTITIES[key] ?? m;
    });
}

function fromCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return '';
  try {
    return String.fromCodePoint(cp);
  } catch {
    return '';
  }
}

/** Escapa valor para uso dentro de atributo entre aspas duplas. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Escapa texto preservando entidades já válidas (evita exibir `&amp;`
 * literalmente quando a tradução usa `&amp;` de propósito).
 */
function escapeText(text: string): string {
  return text.replace(
    /&(?![a-zA-Z][a-zA-Z0-9]{1,30};|#[0-9]{1,7};|#[xX][0-9a-fA-F]{1,6};)|[<>]/g,
    (m) => (m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;'),
  );
}

/**
 * Valida URL decodificando entidades e removendo tab/newline (mesmo tratamento
 * do parser de URL do navegador) antes de inspecionar o esquema.
 */
function isSafeUrl(raw: string, allowedSchemes: Set<string>): boolean {
  const decoded = decodeEntities(raw).replace(/[\t\n\r]/g, '').trim();
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(decoded);
  if (!scheme) return true; // relativa ou fragmento — sem esquema perigoso
  return allowedSchemes.has(scheme[1]!.toLowerCase());
}

/** Normaliza valor de atributo: decodifica (como o navegador faria) e re-escapa. */
function normalizeAttrValue(raw: string): string {
  return escapeAttr(decodeEntities(raw));
}

type AttrPair = [name: string, value: string];

/**
 * Extrai pares nome/valor de uma tag, respeitando aspas (um `>` dentro de
 * aspas não termina a tag) e valores não-aspados do HTML.
 */
function parseAttrs(body: string): AttrPair[] {
  const pairs: AttrPair[] = [];
  const n = body.length;
  let i = 0;
  const isWs = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

  while (i < n) {
    while (i < n && (isWs(body.charAt(i)) || body.charAt(i) === '/')) i++;
    if (i >= n) break;

    let name = '';
    while (i < n && !isWs(body.charAt(i)) && body.charAt(i) !== '=' && body.charAt(i) !== '>' && body.charAt(i) !== '/' && body.charAt(i) !== '<') {
      name += body.charAt(i);
      i++;
    }
    if (!name) {
      i++;
      continue;
    }

    let value = '';
    let j = i;
    while (j < n && isWs(body.charAt(j))) j++;
    if (j < n && body.charAt(j) === '=') {
      j++;
      while (j < n && isWs(body.charAt(j))) j++;
      if (j < n && (body.charAt(j) === '"' || body.charAt(j) === "'")) {
        const quote = body.charAt(j);
        j++;
        const start = j;
        while (j < n && body.charAt(j) !== quote) j++;
        value = body.slice(start, j);
        j++;
      } else {
        const start = j;
        while (j < n && !isWs(body.charAt(j)) && body.charAt(j) !== '>') j++;
        value = body.slice(start, j);
      }
      i = j;
    }
    pairs.push([name.toLowerCase(), value]);
  }
  return pairs;
}

/** Filtra atributos: allowlist + validação de protocolo; força rel seguro. */
function filterAttrs(tag: string, pairs: AttrPair[]): string {
  const kept: string[] = [];
  const seen = new Set<string>();
  let targetBlank = false;

  for (const [name, raw] of pairs) {
    if (!ALLOWED_ATTRS.has(name) || seen.has(name)) continue;
    if (name === 'href' && !isSafeUrl(raw, HREF_SCHEMES)) continue;
    if (name === 'src' && !isSafeUrl(raw, SRC_SCHEMES)) continue;
    if (name === 'target') {
      if (normalizeAttrValue(raw) !== '_blank') continue;
      targetBlank = true;
      continue; // reemitido abaixo com rel garantido
    }
    if (name === 'rel') continue; // regenerado quando necessário
    seen.add(name);
    kept.push(`${name}="${normalizeAttrValue(raw)}"`);
  }

  if (tag === 'a' && targetBlank) {
    kept.push('target="_blank"');
    kept.push('rel="noopener noreferrer"');
  }
  return kept.length > 0 ? ` ${kept.join(' ')}` : '';
}

/**
 * Sanitiza uma string de HTML. Retorna apenas marcação da allowlist.
 * Idempotente e sem dependências de DOM (seguro no SSR e no cliente).
 */
export function sanitizeHtml(input: unknown): string {
  if (typeof input !== 'string' || input.length === 0) return '';

  const lower = input.toLowerCase();
  const n = input.length;
  const stack: string[] = [];
  let out = '';
  let i = 0;

  while (i < n) {
    const lt = input.indexOf('<', i);
    if (lt === -1) {
      out += escapeText(input.slice(i));
      break;
    }
    if (lt > i) out += escapeText(input.slice(i, lt));

    // Comentário / doctype / instrução de processamento → descarta.
    if (input.startsWith('<!--', lt)) {
      const end = input.indexOf('-->', lt + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (input.charAt(lt + 1) === '!' || input.charAt(lt + 1) === '?') {
      const end = input.indexOf('>', lt + 2);
      i = end === -1 ? n : end + 1;
      continue;
    }

    const tagMatch = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)(?=[\s/>])/.exec(input.slice(lt, Math.min(lt + 64, n)));
    if (!tagMatch) {
      out += '&lt;'; // '<' solto (ex.: "<3") vira texto
      i = lt + 1;
      continue;
    }

    const isClosing = tagMatch[1] === '/';
    const tag = tagMatch[2]!.toLowerCase();

    // Localiza o '>' da tag respeitando aspas.
    let j = lt + tagMatch[0].length;
    let quote = '';
    while (j < n) {
      const ch = input[j];
      if (quote) {
        if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        break;
      }
      j++;
    }
    if (j >= n) break; // tag malformada sem fechamento → ignora o resto (seguro)

    const body = input.slice(lt + tagMatch[0].length, j);
    i = j + 1;

    // Tag de texto bruto aberta → remove também o conteúdo.
    if (!isClosing && RAW_TEXT_TAGS.has(tag)) {
      const closeAt = lower.indexOf(`</${tag}`, i);
      if (closeAt === -1) break; // sem fechamento → descarta até o fim
      const closeEnd = input.indexOf('>', closeAt);
      i = closeEnd === -1 ? n : closeEnd + 1;
      continue;
    }

    if (isClosing) {
      const anchor = stack.lastIndexOf(tag);
      if (anchor !== -1) {
        for (let k = stack.length - 1; k >= anchor; k--) out += `</${stack[k]}>`;
        stack.length = anchor;
      }
      // Sem âncora (inclusive tags fora da allowlist) → ignorada: impede breakout.
      continue;
    }

    if (!ALLOWED_TAGS.has(tag)) continue; // tag removida, texto dela é mantido

    const attrs = filterAttrs(tag, parseAttrs(body));
    if (VOID_TAGS.has(tag)) {
      out += `<${tag}${attrs} />`;
    } else {
      out += `<${tag}${attrs}>`;
      stack.push(tag);
    }
  }

  for (let k = stack.length - 1; k >= 0; k--) out += `</${stack[k]}>`;
  return out;
}
