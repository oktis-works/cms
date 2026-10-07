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

  it('should organize the global help around the OKCMS command map', async () => {
    const { generateHelp } = await import('./parser.js');
    const help = generateHelp();
    expect(help).toContain('OKCMS');
    expect(help).toContain('Command map');
    expect(help).toContain('Project');
    expect(help).toContain('Database');
    expect(help).toContain('okcms <command> --help');
    expect(help).not.toContain('--no-install');
  });

  it('should provide focused help for a single command', async () => {
    const { generateHelp } = await import('./parser.js');
    const help = generateHelp('init');
    expect(help).toContain('okcms init');
    expect(help).toContain('--no-install');
    expect(help).toContain('command guide');
  });
});
