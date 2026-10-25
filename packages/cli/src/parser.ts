import { commands, optionTakesValue } from './commands.js';
import { commandGroupNames as registryCommandGroupNames, COMMAND_GROUPS } from './command-registry.js';
import { style, symbol } from './prompt.js';

export interface ParsedArgs {
  command: string | null;
  args: string[];
  options: Record<string, string>;
}

export interface ParsedArgsValidation {
  ok: boolean;
  message?: string;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const sliced = argv.slice(2);
  const first = sliced[0];
  const isFlag = first !== undefined && first.startsWith('-');
  const command: string | null = isFlag ? null : (first ?? null);
  const args: string[] = [];
  const options: Record<string, string> = {};
  let endOptions = false;

  let i = isFlag ? 0 : 1;
  while (i < sliced.length) {
    const arg = sliced[i]!;
    if (!endOptions && arg === '--') {
      endOptions = true;
      i += 1;
      continue;
    }
    const cmd = commands.find((c) => c.name === command);
    if (!endOptions && arg.startsWith('--')) {
      const separator = arg.indexOf('=', 2);
      const key = separator >= 0 ? arg.slice(2, separator) : arg.slice(2);
      const option = cmd?.options.find((o) => o.name === key);
      const repeatable = option?.repeatable === true;
      const inlineValue = separator >= 0 ? arg.slice(separator + 1) : undefined;
      const next = sliced[i + 1];
      if (inlineValue !== undefined) {
        options[key] = repeatable && options[key] !== undefined && options[key] !== 'true'
          ? `${options[key]}\n${inlineValue}`
          : inlineValue;
        i += 1;
      } else if (next && !next.startsWith('-') && optionTakesValue(option)) {
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
    } else if (!endOptions && arg.startsWith('-')) {
      const separator = arg.indexOf('=', 1);
      const alias = separator >= 0 ? arg.slice(1, separator) : arg.slice(1);
      const opt = cmd?.options.find((o) => o.alias === alias);
      const key = opt?.name ?? alias;
      const repeatable = opt?.repeatable === true;
      const inlineValue = separator >= 0 ? arg.slice(separator + 1) : undefined;
      const next = sliced[i + 1];
      if (inlineValue !== undefined) {
        options[key] = repeatable && options[key] !== undefined && options[key] !== 'true'
          ? `${options[key]}\n${inlineValue}`
          : inlineValue;
        i += 1;
      } else if (next && !next.startsWith('-') && optionTakesValue(opt)) {
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

/**
 * Validates the parsed shape before a command handler can mutate state.
 * Parsing remains a pure operation for embedders and tests; the CLI entrypoint
 * calls this guard immediately before dispatch.
 */
export function validateParsedArgs(parsed: ParsedArgs): ParsedArgsValidation {
  const globalOptions = new Set(['help', 'h', 'version', 'v']);
  if (!parsed.command) {
    const unknown = Object.keys(parsed.options).find((key) => !globalOptions.has(key));
    return unknown
      ? { ok: false, message: `unknown option: --${unknown}` }
      : { ok: true };
  }

  const command = commands.find((candidate) => candidate.name === parsed.command);
  if (!command) return { ok: true };

  const byName = new Map(command.options.map((option) => [option.name, option]));
  const aliases = new Map(command.options.map((option) => [option.alias, option]));
  for (const key of Object.keys(parsed.options)) {
    if (globalOptions.has(key)) continue;
    if (!byName.has(key) && !aliases.has(key)) {
      return { ok: false, message: `unknown option for ${command.name}: --${key}` };
    }
  }

  for (const option of command.options) {
    const value = parsed.options[option.name];
    if (value === 'true' && optionTakesValue(option)) {
      return { ok: false, message: `--${option.name} requires a value` };
    }
    if (value !== undefined && value !== 'true' && option.valueKind) {
      const values = option.repeatable ? value.split('\n') : [value];
      for (const candidate of values) {
        if (option.valueKind === 'enum' && option.choices && !option.choices.includes(candidate)) {
          return { ok: false, message: `invalid value for --${option.name}: ${candidate}` };
        }
        if (option.valueKind === 'url' && !/^https?:\/\//i.test(candidate)) {
          return { ok: false, message: `invalid URL for --${option.name}` };
        }
        if (option.valueKind === 'tenant' && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/.test(candidate) && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(candidate)) {
          return { ok: false, message: `invalid tenant for --${option.name}` };
        }
        if (option.valueKind === 'version' && !/^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(candidate)) {
          return { ok: false, message: `invalid version for --${option.name}` };
        }
        if (option.valueKind === 'integer' && !/^\d+$/.test(candidate)) {
          return { ok: false, message: `invalid integer for --${option.name}` };
        }
      }
    }
  }

  const maximum = command.positionals?.max ?? 0;
  if (parsed.args.length > maximum) {
    const label = command.positionals?.label ?? 'positional arguments';
    return {
      ok: false,
      message: `${command.name} accepts at most ${maximum} ${label}; received ${parsed.args.length}`,
    };
  }

  return { ok: true };
}

/** Groups used by both static help and the interactive wizard. */
export function commandGroupNames(): Array<[string, string[]]> {
  return registryCommandGroupNames();
}

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

  for (const [group, names] of COMMAND_GROUPS) {
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
