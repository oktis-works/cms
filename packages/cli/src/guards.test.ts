// @oktis-works/cms - Guardas de segurança da CLI (F0)
//
// Nenhum teste aqui pode depender do ambiente real: a própria caixa de dev
// pode estar em container (e aí `isInContainer()` devolveria true "de graça").
// Todo probe é injetado.

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_REGISTRY,
  assertHostOnly,
  assertNoDockerSocket,
  assertUrlAllowed,
  generateSecret,
  hasDockerSocketMount,
  isUrlAllowed,
  isInContainer,
  looksLikeSecret,
  redact,
  registryAllowlist,
} from './guards.js';

/** Probe neutro: nada existe, nada de ambiente — container = false. */
const hostProbe = { exists: () => false, env: {}, cgroup: null as string | null };

describe('isInContainer', () => {
  it('é false num host limpo', () => {
    expect(isInContainer(hostProbe)).toBe(false);
  });

  it('detecta via /.dockerenv', () => {
    expect(isInContainer({ ...hostProbe, exists: (p) => p === '/.dockerenv' })).toBe(true);
  });

  it('detecta via podman (/run/.containerenv)', () => {
    expect(isInContainer({ ...hostProbe, exists: (p) => p === '/run/.containerenv' })).toBe(true);
  });

  it('detecta via cgroup do docker', () => {
    expect(
      isInContainer({
        ...hostProbe,
        cgroup: '12:memory:/docker/8f1e9c0a1b2c3d4e',
      })
    ).toBe(true);
  });

  it('detecta via cgroup do kubernetes', () => {
    expect(
      isInContainer({ ...hostProbe, cgroup: '0::/kubepods/burstable/podabc' })
    ).toBe(true);
  });

  it('host com systemd não é confundido com container', () => {
    expect(
      isInContainer({ ...hostProbe, cgroup: '0::/user.slice/user-1000.slice' })
    ).toBe(false);
  });

  it('OKCMS_IN_CONTAINER=1 é a marca explícita', () => {
    expect(isInContainer({ ...hostProbe, env: { OKCMS_IN_CONTAINER: '1' } })).toBe(true);
    expect(isInContainer({ ...hostProbe, env: { OKCMS_IN_CONTAINER: '0' } })).toBe(false);
  });
});

describe('assertHostOnly', () => {
  it('libera no host', () => {
    expect(assertHostOnly('okcms update', { probe: hostProbe })).toEqual({
      ok: true,
      message: '',
    });
  });

  it('bloqueia dentro de container e explica o porquê', () => {
    const result = assertHostOnly('okcms update', {
      probe: { ...hostProbe, env: { OKCMS_IN_CONTAINER: '1' } },
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('recusou rodar dentro de um container');
    expect(result.message).toContain('bun add');
    expect(result.message).toContain('--force');
  });

  it('--force é o escape consciente', () => {
    expect(
      assertHostOnly('okcms update', {
        force: true,
        probe: { ...hostProbe, env: { OKCMS_IN_CONTAINER: '1' } },
      }).ok
    ).toBe(true);
  });
});

describe('allowlist de rede', () => {
  it('o destino padrão é o registry npm oficial', () => {
    expect(DEFAULT_REGISTRY).toBe('https://registry.npmjs.org');
    expect(registryAllowlist({})).toEqual([DEFAULT_REGISTRY]);
  });

  it('OKCMS_NPM_REGISTRY estende a allowlist (mirror interno)', () => {
    expect(registryAllowlist({ OKCMS_NPM_REGISTRY: 'https://npm.corp' })).toEqual([
      DEFAULT_REGISTRY,
      'https://npm.corp',
    ]);
  });

  it('aceita o registry e o mirror; recusa host arbitrário', () => {
    const allow = registryAllowlist({ OKCMS_NPM_REGISTRY: 'https://npm.corp' });

    expect(isUrlAllowed('https://registry.npmjs.org/@oktis-works/cms', allow)).toBe(true);
    expect(isUrlAllowed('https://npm.corp/pkg', allow)).toBe(true);
    expect(isUrlAllowed('https://evil.example/pkg', allow)).toBe(false);
    // prefixo parecido não cola: `registry.npmjs.org.evil.example` não é o registry
    expect(isUrlAllowed('https://registry.npmjs.org.evil.example/x', allow)).toBe(false);
    // e fora da allowlist estendida, o mirror também é negado
    expect(isUrlAllowed('https://npm.corp/pkg')).toBe(false);
  });

  it('assertUrlAllowed devolve mensagem com redação', () => {
    const ok = assertUrlAllowed('https://registry.npmjs.org/x');
    expect(ok.ok).toBe(true);

    const bad = assertUrlAllowed('https://evil.example/x');
    expect(bad.ok).toBe(false);
    expect(bad.message).toContain('allowlist');
  });
});

describe('docker.sock', () => {
  it('sintaxe longa de volume', () => {
    const compose = `
  api:
    volumes:
      - type: bind
        source: /var/run/docker.sock
        target: /var/run/docker.sock
`;
    expect(hasDockerSocketMount(compose)).toBe(true);
    expect(assertNoDockerSocket(compose).ok).toBe(false);
  });

  it('sintaxe curta', () => {
    expect(hasDockerSocketMount('  - /var/run/docker.sock:/var/run/docker.sock')).toBe(true);
  });

  it('compose limpo passa', () => {
    const compose = `
  api:
    volumes:
      - ./uploads:/app/uploads
`;
    expect(assertNoDockerSocket(compose)).toEqual({ ok: true, message: '' });
  });
});

describe('redact', () => {
  it('mascara credencial de URL de banco', () => {
    const input = 'falhou em postgresql://postgres:minha-senha@db:5432/okcms';
    const out = redact(input);
    expect(out).toContain('postgres:***@db');
    expect(out).not.toContain('minha-senha');
  });

  it('mascara atribuição KEY=value sensível', () => {
    const out = redact('JWT_SECRET=super-secreto-1234567890\nDB_PASSWORD=hunter2');
    expect(out).not.toContain('super-secreto-1234567890');
    expect(out).not.toContain('hunter2');
    expect(out).toContain('JWT_SECRET=');
  });

  it('não toca em chave comum (log permanece útil)', () => {
    expect(redact('PORT=3000')).toBe('PORT=3000');
    expect(redact('DB_HOST=localhost')).toBe('DB_HOST=localhost');
  });

  it('mascara mesmo com valor entre aspas', () => {
    expect(redact('DB_PASSWORD="senha com espaco"')).not.toContain('senha com espaco');
  });
});

describe('looksLikeSecret', () => {
  it('rejeita placeholder de template', () => {
    expect(looksLikeSecret('change-me')).toBe(false);
    expect(looksLikeSecret('dev-secret-change-in-production')).toBe(false);
    expect(looksLikeSecret('')).toBe(false);
    expect(looksLikeSecret('abc')).toBe(false);
  });

  it('aceita valor que parece segredo real', () => {
    expect(looksLikeSecret('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')).toBe(true);
  });
});

describe('generateSecret', () => {
  it('gera hex da largura pedida', () => {
    const secret = generateSecret(48);
    expect(secret).toMatch(/^[0-9a-f]{96}$/);
  });

  it('é única entre chamadas', () => {
    expect(generateSecret(32)).not.toBe(generateSecret(32));
  });

  it('serve de JWT_SECRET forte', () => {
    expect(looksLikeSecret(generateSecret(32))).toBe(true);
  });
});
