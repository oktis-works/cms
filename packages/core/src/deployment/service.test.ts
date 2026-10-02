import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@oktis-works/database', () => ({
  getConnection: () => ({
    unsafe: vi.fn().mockResolvedValue([]),
  }),
}));

describe('DeploymentService', () => {
  let deploymentService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('./service.js');
    deploymentService = new mod.DeploymentService();
  });

  it('should be instantiable', () => {
    expect(deploymentService).toBeDefined();
  });

  it('should have list, create, getById, rollback methods', () => {
    expect(typeof deploymentService.list).toBe('function');
    expect(typeof deploymentService.create).toBe('function');
    expect(typeof deploymentService.getById).toBe('function');
    expect(typeof deploymentService.rollback).toBe('function');
  });
});
