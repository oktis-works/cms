import { describe, it, expect } from 'vitest';

describe('CLI Parser', () => {
  it('should export parseArgs function', async () => {
    const mod = await import('./parser.js');
    expect(typeof mod.parseArgs).toBe('function');
  });

  it('should parse simple arguments', async () => {
    const { parseArgs } = await import('./parser.js');
    const args = parseArgs(['db:migrate', '--verbose']);
    expect(args).toBeDefined();
  });
});
