// @oktis-works/cms - Leitor/editor de .env que preserva o arquivo do usuário
//
// O `.env` de um projeto é editado à mão: tem comentários, seções, linhas em
// branco e ordem que o autor escolheu. Regenerar o arquivo a partir de um
// mapa de chaves (como quase todo "env wizard" faz) destrói isso. Aqui o
// arquivo é parseado em LINHAS — só a linha da chave muda, o resto passa
// byte a byte.

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface EnvLine {
  /** `assign` = KEY=value; `raw` = comentário, linha em branco ou lixo. */
  kind: 'assign' | 'raw';
  raw: string;
  key?: string;
  value?: string;
  /** Prefixo antes da chave (`   ` ou `export `). */
  prefix?: string;
  /** Separador ao redor do `=` (ex.: `=`, ` = `). */
  sep?: string;
  /** Comentario final da linha, já sem a `#` (ex.: `  # nota`). */
  suffix?: string;
}

const ASSIGN_RE = /^([ \t]*(?:export[ \t]+)?)([A-Za-z_][A-Za-z0-9_]*)([ \t]*=[ \t]*)(.*)$/;

/**
 * Separa `valor # comentário` sem cortar `#` dentro de aspas nem fragmentos
 * de URL (`http://x/#a`) — só considera `#` preceded de espaço ou no início.
 */
function splitSuffix(value: string): { value: string; suffix: string } {
  let quote: string | null = null;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#') {
      const prev = value[i - 1];
      if (i === 0 || prev === ' ' || prev === '\t') {
        // mantém o espaço que separava valor e comentário: o round-trip tem
        // que devolver a linha idêntica (o autor do .env escolheu o alinhamento)
        let start = i;
        while (start > 0 && (value[start - 1] === ' ' || value[start - 1] === '\t')) start--;
        return { value: value.slice(0, start), suffix: value.slice(start) };
      }
    }
  }
  return { value, suffix: '' };
}

/** Remove aspas externas de um valor dotenv. */
function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
  }
  return trimmed;
}

/**
 * Volta a serializar um valor para o formato dotenv: cru quando não ambíguo,
 * com aspas duplas quando contém espaço, `#`, aspas ou expansão de variável.
 */
export function serializeEnvValue(value: string): string {
  if (value === '') return '';
  const needsQuotes = /[\s#"'$`\\]/.test(value);
  if (!needsQuotes) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export class EnvFile {
  lines: EnvLine[];
  readonly path: string | null;

  constructor(text = '', path: string | null = null) {
    this.path = path;
    this.lines = text.length > 0 ? text.split(/\r?\n/).map((raw) => parseLine(raw)) : [];
    // um trailing newline final vira linha vazia no split — mantemos para
    // round-trip fiel
  }

  /** Linhas exatamente como estão no disco. */
  toString(): string {
    return this.lines.map((line) => line.raw).join('\n');
  }

  get(key: string): string | undefined {
    const line = this.lines.find((candidate) => candidate.kind === 'assign' && candidate.key === key);
    if (!line?.value) return undefined;
    return unquote(line.value);
  }

  /** Valor bruto (com aspas/comentário removidos apenas das pontas). */
  has(key: string): boolean {
    return this.lines.some((line) => line.kind === 'assign' && line.key === key);
  }

  keys(): string[] {
    const seen = new Set<string>();
    for (const line of this.lines) {
      if (line.kind === 'assign' && line.key) seen.add(line.key);
    }
    return [...seen];
  }

  /** Todas as chaves → valor (sem aspas). */
  toRecord(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of this.lines) {
      if (line.kind === 'assign' && line.key) out[line.key] = unquote(line.value ?? '');
    }
    return out;
  }

  /**
   * Define/insere uma chave. Na substituição preserva prefixo, separador e
   * comentário final — é o que faz o wizard não "sujar" o arquivo.
   */
  set(key: string, value: string): boolean {
    const serialized = serializeEnvValue(value);
    const existing = this.lines.find(
      (line) => line.kind === 'assign' && line.key === key
    );

    if (existing) {
      const comment = existing.suffix ? `${serialized}${existing.suffix}` : serialized;
      const next = `${existing.prefix ?? ''}${existing.key ?? ''}${existing.sep ?? '='}${comment}`;
      if (existing.raw === next) return false;
      existing.raw = next;
      existing.value = serialized;
      return true;
    }

    this.lines.push({
      kind: 'assign',
      raw: `${key}=${serialized}`,
      key,
      value: serialized,
      prefix: '',
      sep: '=',
      suffix: '',
    });
    return true;
  }

  /** Remove a linha de uma chave (mantém comentários em volta). */
  delete(key: string): boolean {
    const before = this.lines.length;
    this.lines = this.lines.filter((line) => !(line.kind === 'assign' && line.key === key));
    return this.lines.length !== before;
  }

  /** Cria a chave abaixo do último comentário de uma seção (`# --- Foo ---`). */
  setInSection(key: string, value: string, sectionHint: string): boolean {
    if (this.has(key)) return this.set(key, value);

    const hint = sectionHint.toLowerCase();
    let insertAt = -1;
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i]!;
      if (line.kind !== 'raw') continue;
      const text = line.raw.toLowerCase();
      if (text.includes('#') && text.includes(hint)) insertAt = i + 1;
    }

    const serialized = serializeEnvValue(value);
    const entry: EnvLine = {
      kind: 'assign',
      raw: `${key}=${serialized}`,
      key,
      value: serialized,
      prefix: '',
      sep: '=',
      suffix: '',
    };
    if (insertAt >= 0) this.lines.splice(insertAt, 0, entry);
    else this.lines.push(entry);
    return true;
  }

  save(path = this.path, mode = 0o600): void {
    if (!path) throw new Error('EnvFile.save: no path');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${this.toString()}\n`, 'utf-8');
    // .env carrega senha de banco e JWT_SECRET: dono só é o padrão aceitável
    try {
      chmodSync(path, mode);
    } catch {
      // filesystem sem suporte a chmod (Windows) — não é bloqueante
    }
  }
}

function parseLine(raw: string): EnvLine {
  const match = ASSIGN_RE.exec(raw);
  if (!match) return { kind: 'raw', raw };

  const [, prefix, key, sep, rest] = match as unknown as [string, string, string, string, string];
  const { value, suffix } = splitSuffix(rest);
  return { kind: 'assign', raw, key, prefix, sep, value, suffix };
}

export function parseEnv(text: string): EnvFile {
  return new EnvFile(text, null);
}

/** Lê `.env` (ou `.env.example` como fallback) — nunca lança se não existe. */
export function loadEnvFile(path: string): EnvFile {
  if (!existsSync(path)) return new EnvFile('', path);
  return new EnvFile(readFileSync(path, 'utf-8'), path);
}
