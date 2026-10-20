// @oktis-works/plugin-runtime - PluginAPI: api.mail (Item 12)

import { describe, it, expect, vi } from 'vitest';
import { createPluginApi, type PluginApiDependencies } from './plugin-api.js';

function createDeps(overrides: Partial<PluginApiDependencies> = {}): PluginApiDependencies {
  return {
    hooks: {
      addAction: vi.fn(),
      addFilter: vi.fn(),
      removeAction: vi.fn(() => false),
      removeFilter: vi.fn(() => false),
      hasAction: vi.fn(() => false),
      hasFilter: vi.fn(() => false),
      didAction: vi.fn(() => 0),
      getCurrentHook: vi.fn(() => null),
    },
    manifest: { name: 'mail-plugin', version: '1.0.0' } as PluginApiDependencies['manifest'],
    settings: { get: vi.fn(async () => undefined), set: vi.fn(async () => {}) },
    eventBus: { emit: vi.fn(async () => {}) },
    db: { query: vi.fn(async () => []) },
    getTenantId: () => 'tenant-abc',
    getUserId: () => 'user-123',
    getRequestId: () => 'req-456',
    getTenantById: vi.fn(async (id: string) => ({ id, name: 'T', slug: 't' })),
    allowedPermissions: ['mail:send'],
    mail: {
      send: vi.fn(async () => true),
    },
    ...overrides,
  } as PluginApiDependencies;
}

describe('api.mail (Item 12)', () => {
  it('sends with explicit subject/body through the core backend', async () => {
    const deps = createDeps();
    const { api } = createPluginApi(deps);

    const sent = await api.mail.send({ to: 'user@example.com', subject: 'Hi', text: 'Hello' });

    expect(sent).toBe(true);
    expect(deps.mail!.send).toHaveBeenCalledWith({
      tenantId: 'tenant-abc',
      pluginName: 'mail-plugin',
      to: 'user@example.com',
      subject: 'Hi',
      html: undefined,
      text: 'Hello',
      template: undefined,
      params: undefined,
    });
  });

  it('renders registered templates with {param} interpolation', async () => {
    const deps = createDeps();
    const { api } = createPluginApi(deps);

    api.mail.registerTemplate('welcome', {
      subject: 'Welcome, {name}!',
      html: '<p>Hello {name}</p>',
      text: 'Hello {name}',
    });
    await api.mail.send({ to: 'user@example.com', template: 'welcome', params: { name: 'Ada' } });

    expect(deps.mail!.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Welcome, Ada!',
        html: '<p>Hello Ada</p>',
        text: 'Hello Ada',
        template: 'welcome',
      })
    );
  });

  it('rejects unknown templates, invalid recipients and missing bodies', async () => {
    const { api } = createPluginApi(createDeps());
    await expect(api.mail.send({ to: 'not-an-email', subject: 'x', text: 'y' })).rejects.toThrow(/recipient/);
    await expect(api.mail.send({ to: 'a@b.co', subject: 'x', template: 'missing' })).rejects.toThrow(/not registered/);
    await expect(api.mail.send({ to: 'a@b.co', subject: 'x' })).rejects.toThrow(/html or text/);
    expect(() => api.mail.registerTemplate('', { subject: 's' })).toThrow(/name/);
    expect(() => api.mail.registerTemplate('no-subject', {} as never)).toThrow(/subject/);
  });

  it('denies send/registerTemplate without the mail:send permission', async () => {
    const { api } = createPluginApi(createDeps({ allowedPermissions: [] }));
    await expect(api.mail.send({ to: 'a@b.co', subject: 'x', text: 'y' })).rejects.toThrow(/mail:send/);
    expect(() => api.mail.registerTemplate('t', { subject: 's' })).toThrow(/mail:send/);
  });

  it('returns false (degradation) when the mail backend is not wired', async () => {
    const deps = createDeps();
    delete (deps as { mail?: unknown }).mail;
    const { api } = createPluginApi(deps);
    await expect(api.mail.send({ to: 'a@b.co', subject: 'x', text: 'y' })).resolves.toBe(false);
  });
});
