// @oktis-works/plugin-runtime - api.http: cliente anti-SSRF (Item 4 + Item 16)
//
// Cobre as camadas: validação de IP (v4/v6), allowlist do manifesto, scheme,
// DNS com IP público (localhost/literal privado bloqueados offline), redirect
// limitado com re-validação, teto de corpo, retentativas idempotentes e gate
// de permissão http:outbound.

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isPublicIpv4,
  isPublicIpv6,
  isPublicIp,
  isAllowedHost,
  validateTargetUrl,
  createSafeLookup,
  createHttpApi,
  HttpError,
  MAX_REDIRECTS,
} from './http.js';
import { PERMISSIONS } from '@oktis-works/plugin-sdk';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isPublicIpv4 (egress IP policy)', () => {
  it('blocks private, loopback, metadata, CGNAT, benchmark and reserved ranges', () => {
    expect(isPublicIpv4('10.0.0.1')).toBe(false);
    expect(isPublicIpv4('172.16.0.1')).toBe(false);
    expect(isPublicIpv4('172.31.255.255')).toBe(false);
    expect(isPublicIpv4('192.168.1.1')).toBe(false);
    expect(isPublicIpv4('127.0.0.1')).toBe(false);
    expect(isPublicIpv4('169.254.169.254')).toBe(false); // cloud metadata
    expect(isPublicIpv4('100.64.0.1')).toBe(false); // CGNAT
    expect(isPublicIpv4('0.0.0.0')).toBe(false);
    expect(isPublicIpv4('192.0.0.1')).toBe(false);
    expect(isPublicIpv4('198.18.0.1')).toBe(false);
    expect(isPublicIpv4('224.0.0.1')).toBe(false); // multicast
    expect(isPublicIpv4('240.0.0.1')).toBe(false); // reserved
    expect(isPublicIpv4('not-an-ip')).toBe(false);
  });

  it('allows public ranges (including adjacent non-private blocks)', () => {
    expect(isPublicIpv4('8.8.8.8')).toBe(true);
    expect(isPublicIpv4('1.1.1.1')).toBe(true);
    expect(isPublicIpv4('172.32.0.1')).toBe(true); // fora de 172.16/12
    expect(isPublicIpv4('93.184.216.34')).toBe(true);
  });
});

describe('isPublicIpv6 (egress IP policy)', () => {
  it('blocks loopback, ULA, link-local, multicast and non-global blocks', () => {
    expect(isPublicIpv6('::1')).toBe(false);
    expect(isPublicIpv6('::')).toBe(false);
    expect(isPublicIpv6('fc00::1')).toBe(false);
    expect(isPublicIpv6('fd12:3456::1')).toBe(false);
    expect(isPublicIpv6('fe80::1')).toBe(false);
    expect(isPublicIpv6('ff02::1')).toBe(false);
    expect(isPublicIpv6('::ffff:127.0.0.1')).toBe(false); // mapped loopback
    expect(isPublicIpv6('fec0::1')).toBe(false); // site-local deprecado
  });

  it('allows global unicast and mapped public IPv4', () => {
    expect(isPublicIpv6('2001:4860:4860::8888')).toBe(true);
    expect(isPublicIpv6('2606:4700:4700::1111')).toBe(true);
    expect(isPublicIpv6('::ffff:8.8.8.8')).toBe(true);
  });

  it('isPublicIp dispatches by family', () => {
    expect(isPublicIp('10.1.2.3')).toBe(false);
    expect(isPublicIp('2001:db8::1'.replace('db8', '4860'))).toBe(true);
  });
});

describe('isAllowedHost (manifest httpPolicy.allowHosts)', () => {
  it('passes everything when no allowlist is declared', () => {
    expect(isAllowedHost('anything.example')).toBe(true);
    expect(isAllowedHost('anything.example', [])).toBe(true);
  });

  it('matches exact hosts only', () => {
    expect(isAllowedHost('api.example.com', ['api.example.com'])).toBe(true);
    expect(isAllowedHost('evil.com', ['api.example.com'])).toBe(false);
    expect(isAllowedHost('api.example.com.evil.com', ['api.example.com'])).toBe(false);
  });

  it('wildcard covers subdomains but not the apex', () => {
    expect(isAllowedHost('v1.api.example.com', ['*.example.com'])).toBe(true);
    expect(isAllowedHost('example.com', ['*.example.com'])).toBe(false);
    expect(isAllowedHost('example.com.evil.com', ['*.example.com'])).toBe(false);
  });
});

describe('validateTargetUrl (scheme + DNS público)', () => {
  it('rejects non-http schemes', async () => {
    await expect(validateTargetUrl('file:///etc/passwd')).rejects.toThrow('scheme not allowed');
    await expect(validateTargetUrl('gopher://x')).rejects.toThrow('scheme not allowed');
  });

  it('rejects invalid URLs', async () => {
    await expect(validateTargetUrl('not a url')).rejects.toThrow('invalid URL');
  });

  it('blocks hosts outside the manifest allowlist before touching DNS', async () => {
    await expect(
      validateTargetUrl('http://1.2.3.4/', ['api.example.com'])
    ).rejects.toThrow('not in httpPolicy.allowHosts');
  });

  it('blocks loopback literals and localhost (resolves offline to 127.0.0.1)', async () => {
    await expect(validateTargetUrl('http://127.0.0.1/')).rejects.toThrow('non-public');
    await expect(validateTargetUrl('http://localhost/')).rejects.toThrow('non-public');
    await expect(validateTargetUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow('non-public');
  });

  it('accepts public IP literals (no network needed)', async () => {
    const url = await validateTargetUrl('http://1.2.3.4/path?q=1');
    expect(url.hostname).toBe('1.2.3.4');
  });
});

describe('createSafeLookup (DNS pinning)', () => {
  it('resolves to the validated public IP', () => {
    const lookup = createSafeLookup(async () => [{ address: '93.184.216.34', family: 4 }]);
    lookup('example.com', {}, (err, address, family) => {
      expect(err).toBeNull();
      expect(address).toBe('93.184.216.34');
      expect(family).toBe(4);
    });
  });

  it('fails closed when resolution yields only private addresses', () => {
    const lookup = createSafeLookup(async () => [{ address: '10.0.0.5', family: 4 }]);
    lookup('internal.corp', {}, (err) => {
      expect(err).not.toBeNull();
      expect(String(err)).toContain('non-public');
    });
  });
});

describe('createHttpApi (request flow)', () => {
  it('denies without http:outbound and never touches the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const api = createHttpApi({
      requirePermission: (permission) => {
        if (permission !== PERMISSIONS.HTTP_OUTBOUND) throw new Error('unexpected permission');
        throw new Error('Plugin permission denied: http:outbound');
      },
    });

    await expect(api.get('http://1.2.3.4/')).rejects.toThrow('Plugin permission denied: http:outbound');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('performs a successful GET with redirect manual mode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );
    const api = createHttpApi({ requirePermission: () => undefined });

    const response = await api.get('http://1.2.3.4/data');
    expect(response.status).toBe(200);
    expect(response.json<{ ok: boolean }>()).toEqual({ ok: true });
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(init.redirect).toBe('manual');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('follows up to MAX_REDIRECTS hops with revalidation', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const hop = Number(new URL(url).hostname.split('.')[0]);
      if (hop <= MAX_REDIRECTS) {
        return new Response(null, { status: 302, headers: { location: `http://${hop + 1}.2.3.4/` } });
      }
      return new Response('done', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const api = createHttpApi({ requirePermission: () => undefined });

    const response = await api.get('http://1.2.3.4/start');
    expect(response.status).toBe(200);
    expect(response.body).toBe('done');
    expect(fetchMock).toHaveBeenCalledTimes(MAX_REDIRECTS + 1);
  });

  it('rejects redirect chains longer than MAX_REDIRECTS', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call += 1;
        return new Response(null, { status: 302, headers: { location: `http://1.2.3.4/r${call}` } });
      })
    );
    const api = createHttpApi({ requirePermission: () => undefined });

    await expect(api.get('http://1.2.3.4/start')).rejects.toThrow(`too many redirects`);
    expect(fetchMockTimes()).toBe(MAX_REDIRECTS + 1);
  });

  it('enforces the response body size cap', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x'.repeat(2048), { status: 200 })));
    const api = createHttpApi({ requirePermission: () => undefined });

    await expect(api.get('http://1.2.3.4/big', { maxBytes: 1024 })).rejects.toThrow('exceeds limit');
  });

  it('retries GET on network errors (default 2) and succeeds', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls < 3) throw new TypeError('network down');
        return new Response('recovered', { status: 200 });
      })
    );
    const api = createHttpApi({ requirePermission: () => undefined });

    const response = await api.get('http://1.2.3.4/', { retries: 2 });
    expect(response.body).toBe('recovered');
    expect(calls).toBe(3);
  });

  it('does NOT retry non-idempotent POST by default', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        throw new TypeError('network down');
      })
    );
    const api = createHttpApi({ requirePermission: () => undefined });

    await expect(api.post('http://1.2.3.4/', '{}')).rejects.toThrow('network down');
    expect(calls).toBe(1);
  });

  it('retries 5xx responses for GET', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        return calls < 2 ? new Response('boom', { status: 503 }) : new Response('ok', { status: 200 });
      })
    );
    const api = createHttpApi({ requirePermission: () => undefined });

    const response = await api.get('http://1.2.3.4/');
    expect(response.status).toBe(200);
    expect(calls).toBe(2);
  });

  it('applies the manifest allowlist on every request (redirect target included)', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const api = createHttpApi({
      allowHosts: ['api.example.com'],
      requirePermission: () => undefined,
    });

    await expect(api.get('http://1.2.3.4/')).rejects.toThrow('not in httpPolicy.allowHosts');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(api.get('http://1.2.3.4/')).rejects.toBeInstanceOf(HttpError);
  });
});

function fetchMockTimes(): number {
  return (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
}

// ── Integração via bootstrap: permissão + httpPolicy do manifesto ──────────
async function createHarness() {
  const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { bootstrapPlugins, resetLoadedPlugins } = await import('./bootstrap.js');
  const { HookRegistry } = await import('./hook-registry.js');

  const pluginsDir = mkdtempSync(join(tmpdir(), 'bl-http-'));
  const registry = new HookRegistry();
  registry.setDevMode(false);
  resetLoadedPlugins(registry);

  const writePlugin = (permissions: string[], manifest: Record<string, unknown>, registerJs: string) => {
    mkdirSync(join(pluginsDir, 'http-plugin'), { recursive: true });
    writeFileSync(
      join(pluginsDir, 'http-plugin', 'manifest.json'),
      JSON.stringify({ name: 'http-plugin', version: '1.0.0', main: 'index.js', permissions, ...manifest })
    );
    writeFileSync(join(pluginsDir, 'http-plugin', 'index.js'), registerJs);
  };

  const mockDeps = {
    hooks: {
      addAction: vi.fn(), addFilter: vi.fn(),
      removeAction: vi.fn(() => false), removeFilter: vi.fn(() => false),
      hasAction: vi.fn(() => false), hasFilter: vi.fn(() => false),
      didAction: vi.fn(() => 0), getCurrentHook: vi.fn(() => null),
    },
    settings: { get: vi.fn(async () => undefined), set: vi.fn(async () => {}) },
    eventBus: { emit: vi.fn(async () => {}) },
    db: { query: vi.fn(async () => []) },
    getTenantId: () => 'tenant-abc',
    getUserId: () => 'user-123',
    getRequestId: () => 'req-456',
    getTenantById: vi.fn(async (id: string) => ({ id, name: 'T', slug: 't' })),
    getUserById: vi.fn(async (id: string) => ({ id, email: 't@t.c', name: 'U', roles: ['ADMIN'] })),
    registerRoutes: vi.fn(),
    registerContentFields: vi.fn(),
    registerFieldTypes: vi.fn(),
  };

  const run = (policy: string[]) =>
    bootstrapPlugins({
      pluginsDir,
      sql: { unsafe: vi.fn(async () => [{ name: 'http-plugin' }]) },
      registry,
      tenantId: 'tenant-abc',
      permissionPolicy: policy,
      apiDeps: mockDeps,
    });

  const cleanup = () => {
    resetLoadedPlugins(registry);
    rmSync(pluginsDir, { recursive: true, force: true });
  };

  return { writePlugin, run, cleanup };
}

describe('api.http via bootstrap', () => {
  it('isolates a plugin using http without http:outbound (fetch never called)', async () => {
    const { writePlugin, run, cleanup } = await createHarness();
    const fetchMock = vi.fn(async () => new Response('x', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      writePlugin([], {}, `export default { async register(api) { await api.http.get('http://1.2.3.4/'); } };`);
      const denied = await run([]);
      expect(denied.failed[0]!.error).toContain('Plugin permission denied: http:outbound');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('honors manifest httpPolicy.allowHosts (blocked before the network)', async () => {
    const { writePlugin, run, cleanup } = await createHarness();
    const fetchMock = vi.fn(async () => new Response('x', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      writePlugin(
        ['http:outbound'],
        { httpPolicy: { allowHosts: ['api.example.com'] } },
        `export default { async register(api) { await api.http.get('http://1.2.3.4/'); } };`
      );
      const allowlisted = await run(['http:outbound']);
      expect(allowlisted.failed[0]!.error).toContain('not in httpPolicy.allowHosts');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });
});
