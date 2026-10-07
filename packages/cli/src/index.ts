#!/usr/bin/env bun

import { parseArgs, generateHelp } from './parser.js';
import { getCommand } from './commands.js';
import { style } from './prompt.js';

export type { Command, Option } from './commands.js';
export type { ParsedArgs } from './parser.js';
export { parseArgs, generateHelp } from './parser.js';
export { commands, getCommand } from './commands.js';

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  if (parsed.options['version'] || parsed.options['v']) {
    const pkg = await import('../package.json', { with: { type: 'json' } });
    console.log(pkg.default.version);
    process.exit(0);
  }

  if (!parsed.command) {
    console.log(generateHelp());
    process.exit(0);
  }

  const cmd = getCommand(parsed.command);

  if (!cmd) {
    console.error(`\n${style.red('✗')} Unknown command: ${parsed.command}`);
    console.error(`${style.dim('  Run')} ${style.cyan('okcms --help')} ${style.dim('for the command map.')}`);
    process.exit(1);
  }

  if (parsed.options['help'] || parsed.options['h']) {
    console.log(generateHelp(parsed.command));
    process.exit(0);
  }

  for (const opt of cmd.options) {
    if (opt.required && !parsed.options[opt.name]) {
      console.error(`\n${style.red('✗')} Missing required option: --${opt.name}`);
      console.error(`${style.dim('  Run')} ${style.cyan(`okcms ${cmd.name} --help`)} ${style.dim('for usage.')}`);
      process.exit(1);
    }
    if (parsed.options[opt.name] === undefined && opt.default) {
      parsed.options[opt.name] = opt.default;
    }
  }

  try {
    await cmd.handler(parsed.args, parsed.options);
  } catch (error) {
    console.error(`\n${style.red('✗')} ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
