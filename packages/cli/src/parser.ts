import { commands } from './commands.js';
import { style, symbol } from './prompt.js';

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

const commandGroups: Array<[string, string[]]> = [
  ['Project', ['init', 'start', 'stop', 'status', 'doctor', 'config']],
  ['Database', ['db:migrate', 'db:rollback', 'db:status', 'db:backup', 'db:restore', 'seed', 'user:create']],
  ['Extensions', ['plugin:create', 'plugin:install', 'plugin:list', 'plugin:search', 'plugin:manage', 'theme:create', 'theme:install', 'theme:list', 'theme:search', 'theme:manage', 'theme:build']],
  ['Deploy', ['build', 'update', 'redeploy', 'rollback', 'deploy']],
  ['System', ['prerender', 'media:migrate', 'system:status']],
];

function commandByName(name: string): (typeof commands)[number] | undefined {
  return commands.find((cmd) => cmd.name === name);
}

function commandLine(name: string): string {
  const cmd = commandByName(name);
  if (!cmd) return '';
  return `  ${style.cyan(name.padEnd(18))} ${style.dim(cmd.description)}`;
}

/** Compact, grouped help for the CLI entry point. Detailed options live per command. */
export function generateHelp(commandName?: string): string {
  if (commandName) {
    const cmd = commandByName(commandName);
    if (!cmd) return `Unknown command: ${commandName}`;

    const lines: string[] = [
      `${style.cyan('  ◈')} ${style.bold('OKCMS')} ${style.dim('· command guide')}`,
      '',
      `${style.bold(`  okcms ${cmd.name}`)}`,
      `  ${cmd.description}`,
      '',
      style.bold('  Usage'),
      `  okcms ${cmd.name}${cmd.options.some((option) => option.required) ? ' [options]' : ' [options]'}`,
    ];

    if (cmd.options.length > 0) {
      lines.push('', style.bold('  Options'));
      for (const option of cmd.options) {
        const required = option.required ? style.yellow('required') : option.default ? style.dim(`default: ${option.default}`) : '';
        lines.push(`  -${option.alias}, --${option.name.padEnd(18)} ${option.description}${required ? ` ${required}` : ''}`);
      }
    }

    lines.push('', style.dim(`  Run ${symbol.arrow} okcms --help for the command map.`));
    return lines.join('\n');
  }

  const lines: string[] = [
    `${style.cyan('  ◈')} ${style.bold('OKCMS')} ${style.dim('· clear content operations')}`,
    style.dim('  A focused command center for your CMS project.'),
    '',
    style.bold('  Usage'),
    '  okcms <command> [options]',
    '',
    style.bold('  Command map'),
  ];

  for (const [group, names] of commandGroups) {
    lines.push('', `  ${style.blue(group)}`);
    for (const name of names) lines.push(commandLine(name));
  }

  lines.push(
    '',
    style.bold('  Quick start'),
    `  ${style.dim(`${symbol.arrow} `)}okcms init my-project`,
    `  ${style.dim(`${symbol.arrow} `)}okcms start`,
    `  ${style.dim(`${symbol.arrow} `)}okcms doctor`,
    '',
    style.dim('  Need the details? Run: okcms <command> --help'),
    style.dim('  -h, --help     show this guide    -v, --version  show version')
  );

  return lines.join('\n');
}
