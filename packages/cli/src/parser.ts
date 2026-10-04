import { commands } from './commands.js';

export interface ParsedArgs {
  command: string | null;
  args: string[];
  options: Record<string, string>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const sliced = argv.slice(2);
  const first = sliced[0];
  const isFlag = first !== undefined && first.startsWith('-');
  const command: string | null = isFlag ? null : (first ?? null);
  const args: string[] = [];
  const options: Record<string, string> = {};

  let i = isFlag ? 0 : 1;
  while (i < sliced.length) {
    const arg = sliced[i]!;
    const cmd = commands.find((c) => c.name === command);
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const repeatable = cmd?.options.find((o) => o.name === key)?.repeatable === true;
      const next = sliced[i + 1];
      if (next && !next.startsWith('--')) {
        // repetível acumula em linhas; senão a 2ª ocorrência engolia a 1ª
        options[key] =
          repeatable && options[key] !== undefined && options[key] !== 'true'
            ? `${options[key]}\n${next}`
            : next;
        i += 2;
      } else {
        options[key] = 'true';
        i += 1;
      }
    } else if (arg.startsWith('-')) {
      const alias = arg.slice(1);
      const opt = cmd?.options.find((o) => o.alias === alias);
      const key = opt?.name ?? alias;
      const repeatable = opt?.repeatable === true;
      const next = sliced[i + 1];
      if (next && !next.startsWith('-')) {
        options[key] =
          repeatable && options[key] !== undefined && options[key] !== 'true'
            ? `${options[key]}\n${next}`
            : next;
        i += 2;
      } else {
        options[key] = 'true';
        i += 1;
      }
    } else {
      args.push(arg);
      i += 1;
    }
  }

  return { command, args, options };
}

export function generateHelp(): string {
  const lines: string[] = ['OkCMS CLI', '', 'Usage: okcms <command> [options]', '', 'Commands:'];

  for (const cmd of commands) {
    lines.push(`  ${cmd.name.padEnd(20)} ${cmd.description}`);
    for (const opt of cmd.options) {
      lines.push(`    -${opt.alias}, --${opt.name.padEnd(16)} ${opt.description}${opt.required ? ' (required)' : ''}`);
    }
  }

  lines.push('');
  lines.push('Options:');
  lines.push('  -h, --help         Show this help message');
  lines.push('  -v, --version      Show version');

  return lines.join('\n');
}
