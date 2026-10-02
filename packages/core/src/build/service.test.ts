import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@oktis-works/database', () => ({
  getConnection: () => ({
    unsafe: vi.fn().mockResolvedValue([]),
  }),
}));

describe('BuildService', () => {
  let buildService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('./service.js');
    buildService = new mod.BuildService();
  });

  it('should be instantiable', () => {
    expect(buildService).toBeDefined();
  });

  it('should have list method', () => {
    expect(typeof buildService.list).toBe('function');
  });

  it('should have create method', () => {
    expect(typeof buildService.create).toBe('function');
  });
});
