import { describe, it, expect } from 'vitest';

describe('CLI Parser', () => {
  it('should export parseArgs function', async () => {
    const mod = await import('./parser.js');
    expect(typeof mod.parseArgs).toBe('function');
  });

  it('should parse simple arguments', async () => {
    const { parseArgs } = await import('./parser.js');
    const args = parseArgs(['bun', 'okcms', 'db:migrate', '--verbose']);
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

  it('keeps positional arguments after boolean flags', async () => {
    const { parseArgs } = await import('./parser.js');
    expect(parseArgs(['bun', 'okcms', 'init', '--no-install', 'my-site'])).toEqual({
      command: 'init',
      args: ['my-site'],
      options: { 'no-install': 'true' },
    });
  });

  it('supports the end-of-options marker', async () => {
    const { parseArgs } = await import('./parser.js');
    expect(parseArgs(['bun', 'okcms', 'init', '--', '--literal-directory'])).toEqual({
      command: 'init',
      args: ['--literal-directory'],
      options: {},
    });
  });

  it('supports equals syntax for value and boolean options', async () => {
    const { parseArgs, validateParsedArgs } = await import('./parser.js');
    const parsed = parseArgs(['bun', 'okcms', 'init', '--lang=pt', '--no-install=true', 'my-site']);
    expect(parsed).toEqual({
      command: 'init',
      args: ['my-site'],
      options: { lang: 'pt', 'no-install': 'true' },
    });
    expect(validateParsedArgs(parsed)).toEqual({ ok: true });
  });

  it('rejects unknown options and missing values before dispatch', async () => {
    const { parseArgs, validateParsedArgs } = await import('./parser.js');
    expect(validateParsedArgs(parseArgs(['bun', 'okcms', 'init', '--wat']))).toEqual({
      ok: false,
      message: 'unknown option for init: --wat',
    });
    expect(validateParsedArgs(parseArgs(['bun', 'okcms', 'init', '--lang']))).toEqual({
      ok: false,
      message: '--lang requires a value',
    });
  });

  it('rejects invalid typed enum values before dispatch', async () => {
    const { parseArgs, validateParsedArgs } = await import('./parser.js');
    expect(validateParsedArgs(parseArgs(['bun', 'okcms', 'init', '--lang', 'fr']))).toEqual({
      ok: false,
      message: 'invalid value for --lang: fr',
    });
    expect(validateParsedArgs(parseArgs(['bun', 'okcms', 'update', '--target', 'mysql']))).toEqual({
      ok: false,
      message: 'invalid value for --target: mysql',
    });
  });

  it('rejects extra positional arguments before dispatch', async () => {
    const { parseArgs, validateParsedArgs } = await import('./parser.js');
    expect(validateParsedArgs(parseArgs(['bun', 'okcms', 'init', 'site', 'name', 'extra']))).toEqual({
      ok: false,
      message: 'init accepts at most 2 project directory and optional project name; received 3',
    });
    expect(validateParsedArgs(parseArgs(['bun', 'okcms', 'db:restore', 'a.dump', 'b.dump']))).toEqual({
      ok: false,
      message: 'db:restore accepts at most 1 dump file; received 2',
    });
  });

  it('exposes every declared command through the grouped catalog', async () => {
    const { commandGroupNames } = await import('./parser.js');
    const { commands } = await import('./commands.js');
    const grouped = new Set(commandGroupNames().flatMap(([, names]) => names));
    expect(commands.filter((command) => !grouped.has(command.name)).map((command) => command.name)).toEqual([]);
  });

  it('keeps the command safety metadata aligned with the public catalog', async () => {
    const { commands } = await import('./commands.js');
    const { commandMetadata, registeredCommandNames } = await import('./command-registry.js');
    const registered = new Set(registeredCommandNames());
    expect(commands.map((command) => command.name).filter((name) => !registered.has(name))).toEqual([]);
    expect(commandMetadata('db:status').risk).toBe('read-only');
    expect(commandMetadata('db:inventory').requiresProject).toBe(false);
    expect(commandMetadata('db:restore').risk).toBe('destructive');
  });
});
