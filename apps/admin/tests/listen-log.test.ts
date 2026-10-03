// @oktis-works/admin - Reescrita do aviso de listen do @astrojs/node
// O adapter loga "https://" (instanceof https.Server é true sob Bun até pra
// http.Server) e, em WSL, um IP interno que não responde do Windows.
// Cenários reproduzem o formato real do logger: prefixo + multiline.

import { describe, it, expect } from 'vitest';
import {
  looksLikeListenLog,
  rewriteListenChunk,
  installListenLogRewrite,
} from '../bin/listen-log.js';

const ADAPTER_MESSAGE =
  '11:04:11 [@astrojs/node] Server listening on \n' +
  '  local: https://localhost:3005 \t\n' +
  '  network: https://10.255.255.254:3005\n';

describe('looksLikeListenLog', () => {
  it('reconhece o multiline do adapter', () => {
    expect(looksLikeListenLog(ADAPTER_MESSAGE)).toBe(true);
  });

  it('reconhece chunk avulso de local/network indentado', () => {
    expect(looksLikeListenLog('  local: https://localhost:3005 \t')).toBe(true);
    expect(looksLikeListenLog('  network: https://10.255.255.254:3005\n')).toBe(true);
  });

  it('ignora texto comum', () => {
    expect(looksLikeListenLog('GET / 200 12ms')).toBe(false);
    expect(looksLikeListenLog('local: something in prose')).toBe(false);
  });
});

describe('rewriteListenChunk', () => {
  it('fora de WSL: http correto e linha network preservada', () => {
    const out = rewriteListenChunk(ADAPTER_MESSAGE, false);
    expect(out).toContain('local: http://localhost:3005');
    expect(out).toContain('network: http://10.255.255.254:3005');
    expect(out).not.toContain('https://');
  });

  it('em WSL: http correto e linha network removida', () => {
    const out = rewriteListenChunk(ADAPTER_MESSAGE, true);
    expect(out).toContain('local: http://localhost:3005');
    expect(out).not.toContain('network:');
    expect(out).not.toContain('https://');
  });

  it('em WSL: chunk que só é a linha network é suprimido (null)', () => {
    expect(rewriteListenChunk('  network: https://10.255.255.254:3005\n', true)).toBeNull();
  });

  it('fora de WSL: chunk só de network vira http (não suprime)', () => {
    const out = rewriteListenChunk('  network: https://10.255.255.254:3005\n', false);
    expect(out).toBe('  network: http://10.255.255.254:3005\n');
  });

  it('chunk só de local vira http em qualquer ambiente', () => {
    for (const wsl of [true, false]) {
      expect(rewriteListenChunk('  local: https://localhost:3001 \t', wsl)).toBe(
        '  local: http://localhost:3001 \t',
      );
    }
  });

  it('texto fora do aviso passa intacto', () => {
    const msg = '12:00:00 [api] https://example.com docs';
    expect(rewriteListenChunk(msg, true)).toBe(msg);
  });
});

describe('installListenLogRewrite', () => {
  it('embrulha log/info/warn/error e reescreve na escrita', () => {
    const calls: { name: string; args: unknown[] }[] = [];
    const fake: Record<string, unknown> = {};
    for (const name of ['log', 'info', 'warn', 'error']) {
      fake[name] = (...args: unknown[]) => calls.push({ name, args });
    }
    installListenLogRewrite(fake, true);

    // formato do astro logger: console.info(prefixo + mensagem)
    (fake['info'] as (...a: unknown[]) => void)(ADAPTER_MESSAGE);
    expect(calls).toHaveLength(1);
    const first = calls[0]!;
    expect(first.name).toBe('info');
    const written = String(first.args[0]);
    expect(written).toContain('http://localhost:3005');
    expect(written).not.toContain('network:');
    expect(written).not.toContain('https://');
  });

  it('suprime a escrita quando o único argumento é a linha network (WSL)', () => {
    const calls: unknown[][] = [];
    const fake: Record<string, unknown> = { info: (...args: unknown[]) => calls.push(args) };
    installListenLogRewrite(fake, true);

    (fake['info'] as (...a: unknown[]) => void)('  network: https://10.255.255.254:3005\n');
    expect(calls).toHaveLength(0);
  });

  it('mantém argumentos não-string e métodos ausentes', () => {
    const calls: unknown[][] = [];
    const fake: Record<string, unknown> = { log: (...args: unknown[]) => calls.push(args) };
    installListenLogRewrite(fake, false); // sem info/warn/error — não deve lançar

    (fake['log'] as (...a: unknown[]) => void)('objeto: ', { a: 1 });
    expect(calls).toEqual([['objeto: ', { a: 1 }]]);
  });
});
