import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OkCMSClient', () => {
  let client: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'test' }),
    });
    const mod = await import('./client.js');
    client = new mod.OkCMSClient('http://localhost:3000');
  });

  it('should create a client instance', () => {
    expect(client).toBeDefined();
  });

  it('should have login method', () => {
    expect(typeof client.login).toBe('function');
  });

  it('should have content methods', () => {
    expect(typeof client.listContent).toBe('function');
    expect(typeof client.createContent).toBe('function');
    expect(typeof client.getContent).toBe('function');
  });

  it('should have user methods', () => {
    expect(typeof client.listUsers).toBe('function');
    expect(typeof client.createUser).toBe('function');
  });

  it('should have tenant methods', () => {
    expect(typeof client.listTenants).toBe('function');
    expect(typeof client.createTenant).toBe('function');
  });

  it('should have role methods', () => {
    expect(typeof client.listRoles).toBe('function');
    expect(typeof client.createRole).toBe('function');
  });

  it('should have media methods', () => {
    expect(typeof client.listMedia).toBe('function');
    expect(typeof client.uploadMedia).toBe('function');
  });

  it('should have plugin methods', () => {
    expect(typeof client.listPlugins).toBe('function');
    expect(typeof client.installPlugin).toBe('function');
  });

  it('should have theme methods', () => {
    expect(typeof client.listThemes).toBe('function');
    expect(typeof client.installTheme).toBe('function');
  });

  it('should have deployment methods', () => {
    expect(typeof client.listDeployments).toBe('function');
    expect(typeof client.createDeployment).toBe('function');
  });
});
