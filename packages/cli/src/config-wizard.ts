// @oktis-works/cms - Wizard `okcms config` (F1)
//
// Três modos, todos sobre o MESMO catálogo (`env-schema.ts`):
//   · TTY            → wizard seção por seção, com máscara de segredo;
//   · --set K=V      → aplicação pontual validada (CI/scriptIdor);
//   · --list         → leitura segura (segredos mascarados por padrão).
//
// O `.env` é editado in-place pelo `EnvFile`: comentários, seções e ordem do
// arquivo do operador sobrevivem ao wizard. Nada é gravado sem confirmação
// explícita — Ctrl+C no meio descarta.

import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { EnvFile, loadEnvFile } from './env-file.js';
import {
  ENV_FIELDS,
  ENV_SECTIONS,
  fieldsForSection,
  sectionById,
  validateField,
  type EnvField,
} from './env-schema.js';
import { Prompt, style, symbol, type PromptIO } from './prompt.js';
import { assertHostOnly, generateSecret, looksLikeSecret, redact } from './guards.js';

export interface ConfigWizardOptions {
  /** `KEY=VALUE` com múltiplas entradas separadas por `\n` (parser repetível). */
  set?: string;
  list?: boolean;
  showSecrets?: boolean;
  nonInteractive?: boolean;
  /** Pula direto para uma seção. */
  section?: string;
  force?: boolean;
  cwd?: string;
  /** Prompt injetável (testes / reuso no update). */
  prompt?: Prompt;
  /** IO alternativo quando não se passa um Prompt pronto. */
  io?: Partial<PromptIO>;
}

/** `••••` — nunca o valor real na tela. */
export function maskValue(value: string): string {
  if (!value) return '(não definido)';
  const width = Math.min(Math.max(value.length, 4), 12);
  return '•'.repeat(width);
}

/** Valor "apresentável": segredo mascarado, o resto cru. */
export function displayValue(field: EnvField | undefined, value: string): string {
  if (!value) return '(vazio)';
  if (field?.type === 'secret') return maskValue(value);
  return value;
}

/** `A=1\nB=2` → pares validos, descartando lixo. */
export function parseSetArgs(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry.includes('='));
}

function fieldByKey(key: string): EnvField | undefined {
  return ENV_FIELDS.find((field) => field.key === key);
}

interface SetPlan {
  key: string;
  value: string;
  field?: EnvField;
}

/**
 * Valida TODOS os pares antes de aplicar QUALQUER UM — meio gravado com a
 * outra metade inválida deixa o `.env` num estado que ninguém quer.
 */
export function planSet(pairs: string[]): { plan: SetPlan[]; errors: string[] } {
  const plan: SetPlan[] = [];
  const errors: string[] = [];

  for (const pair of pairs) {
    const index = pair.indexOf('=');
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1);

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      errors.push(`chave inválida: "${key}"`);
      continue;
    }

    const field = fieldByKey(key);
    if (!field) {
      errors.push(
        `chave desconhecida: ${key} — não consta do catálogo do OkCMS. ` +
          `Use \`okcms config --list\` para ver as suportadas.`
      );
      continue;
    }

    const problem = validateField(field, value);
    if (problem) {
      errors.push(`${key}: ${problem}`);
      continue;
    }

    plan.push({ key, value, field });
  }

  return { plan, errors };
}

function loadEnv(cwd: string): { env: EnvFile; seeded: boolean; path: string } {
  const path = join(cwd, '.env');
  if (existsSync(path)) return { env: loadEnvFile(path), seeded: false, path };

  // Sem .env: semeia a partir do exemplo para o wizard ter o que mostrar —
  // mas NÃO grava até o operador confirmar.
  const examplePath = join(cwd, '.env.example');
  const seed = existsSync(examplePath) ? readFileSync(examplePath, 'utf-8') : '';
  return { env: new EnvFile(seed, path), seeded: true, path };
}

function printList(env: EnvFile, showSecrets: boolean): void {
  for (const section of ENV_SECTIONS) {
    const fields = fieldsForSection(section.id, env.toRecord());
    if (fields.length === 0) continue;

    console.log(`\n# ${section.title} — ${section.hint}`);
    for (const field of fields) {
      const raw = env.get(field.key) ?? '';
      // segredo só sai cru com --show-secrets explícito
      const shown =
        field.type === 'secret' && !showSecrets ? maskValue(raw) : raw;
      console.log(`${field.key}=${shown}`);
    }
  }
}

export async function runConfigWizard(opts: ConfigWizardOptions = {}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();

  // 1. A CLI só configura o host — dentro de um container ela exporia o .env.
  const guard = assertHostOnly('okcms config', { force: opts.force });
  if (!guard.ok) {
    console.error(guard.message);
    return 1;
  }

  const { env, seeded, path } = loadEnv(cwd);
  const relPath = relative(cwd, path) || '.env';

  // 2. --set: aplicação pontual validada (fluxo de CI)
  const pairs = parseSetArgs(opts.set);
  if (pairs.length > 0) {
    const { plan, errors } = planSet(pairs);
    if (errors.length > 0) {
      for (const error of errors) console.error(`✗ ${error}`);
      return 1;
    }

    const changed: string[] = [];
    for (const entry of plan) {
      const before = env.get(entry.key) ?? '';
      if (before === entry.value) continue;
      env.set(entry.key, entry.value);
      changed.push(entry.key);
    }

    if (changed.length === 0) {
      console.log('✓ nada a alterar — os valores já estavam assim.');
      return 0;
    }

    env.save(path);
    console.log(`✓ ${changed.length} chave(s) gravada(s) em ${relPath} (permissão 600):`);
    for (const key of changed) {
      const field = fieldByKey(key);
      const now = env.get(key) ?? '';
      // segredo nunca aparece em log — só "definido"
      const after = field?.type === 'secret' ? maskValue(now) : now;
      console.log(`  ${symbol.arrow} ${key}=${redact(after)}`);
    }
    return 0;
  }

  // 3. --list / --non-interactive: leitura de máquina. `--non-interactive`
  //    sozinho também cai aqui — sem TTY não há wizard para navegar.
  if (opts.list || opts.nonInteractive) {
    printList(env, opts.showSecrets === true);
    return 0;
  }

  // 4. Sem TTY e sem flag → não há como "navegar"; diz o que fazer.
  const prompt = opts.prompt ?? new Prompt(opts.io);
  if (!opts.prompt && !prompt.interactive && !opts.nonInteractive) {
    prompt.close();
    console.error('okcms config: sem terminal — use uma das opções:');
    console.error('  okcms config --list              lista as chaves (segredos mascarados)');
    console.error('  okcms config --set CHAVE=valor    altera e valida uma chave');
    console.error('  okcms config --non-interactive    mesma saída de --list (CI)');
    return 1;
  }

  return runInteractive(prompt, env, { path, relPath, seeded, section: opts.section });
}

interface InteractiveCtx {
  path: string;
  relPath: string;
  seeded: boolean;
  section?: string;
}

async function runInteractive(
  prompt: Prompt,
  env: EnvFile,
  ctx: InteractiveCtx
): Promise<number> {
  const changed = new Set<string>();
  let cancelled = false;

  const onInterrupt = (): void => {
    cancelled = true;
    prompt.write(`\n  ${style.yellow(symbol.warn)} cancelado — nada foi gravado.\n`);
    process.exit(130);
  };
  process.once('SIGINT', onInterrupt);

  try {
    prompt.heading(`OkCMS config — ${ctx.relPath}`);
    prompt.info(`${env.keys().length} chave(s) no arquivo`);
    if (ctx.seeded) {
      prompt.warn('.env não existia — wizard parte do .env.example; nada gravado ainda');
    }
    prompt.info('Enter mantém o valor atual · Ctrl+C descarta tudo');

    const record = (): Record<string, string> => {
      const out = env.toRecord();
      for (const key of changed) out[key] = env.get(key) ?? '';
      return out;
    };

    const sectionIds = ENV_SECTIONS.map((section) => section.id);
    let target = ctx.section;

    // --section pula o menu principal (scriptável mesmo com TTY)
    if (target && !sectionIds.includes(target)) {
      prompt.error(`seção desconhecida: ${target} — use uma de: ${sectionIds.join(', ')}`);
      prompt.close();
      return 1;
    }

    for (;;) {
      if (cancelled) return 130;

      if (!target) {
        const choices = ENV_SECTIONS.map((section) => ({
          value: section.id,
          label: section.title,
          hint: `${section.hint} · ${fieldsForSection(section.id, record()).length} campos`,
        }));
        choices.push({
          value: '__show',
          label: 'Resumo das alterações',
          hint: changed.size > 0 ? `${changed.size} pendente(s)` : 'nenhuma',
        });
        choices.push({ value: '__quit', label: 'Sair', hint: 'confirma gravação' });

        const picked = await prompt.select('Seção', choices);
        if (picked === '__show') {
          printSummary(prompt, env, changed);
          continue;
        }
        if (picked === '__quit') break;
        target = picked;
      }

      await runSection(prompt, env, target, record, changed);
      target = undefined;

      const more = await prompt.confirm('Editar outra seção?', { defaultValue: false });
      if (!more) break;
    }

    if (changed.size === 0) {
      prompt.info('nenhuma alteração — arquivo intacto.');
      return 0;
    }

    const ok = await prompt.confirm(
      `Gravar ${changed.size} alteração(ões) em ${ctx.relPath}?`,
      { defaultValue: true }
    );
    if (!ok) {
      prompt.warn('descartado — nada foi gravado.');
      return 0;
    }

    env.save(ctx.path);
    prompt.success(`${changed.size} chave(s) gravada(s) — permissão 600`);
    prompt.info('reinicie os apps para as mudanças valerem (okcms start / restart dos containers)');
    return 0;
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    prompt.close();
  }
}

function printSummary(prompt: Prompt, env: EnvFile, changed: Set<string>): void {
  prompt.heading('Resumo');
  if (changed.size === 0) {
    prompt.info('nenhuma alteração pendente');
    return;
  }
  for (const key of changed) {
    const field = fieldByKey(key);
    const value = env.get(key) ?? '';
    const shown = field?.type === 'secret' ? maskValue(value) : value;
    prompt.write(`  ${style.cyan(symbol.arrow)} ${key}=${shown}\n`);
  }
}

async function runSection(
  prompt: Prompt,
  env: EnvFile,
  sectionId: string,
  record: () => Record<string, string>,
  changed: Set<string>
): Promise<void> {
  const section = sectionById(sectionId);
  if (!section) return;

  const fields = fieldsForSection(sectionId, record());
  prompt.heading(`${section.title} — ${section.hint}`);

  if (fields.length === 0) {
    prompt.info('nenhum campo aplicável no momento');
    return;
  }

  for (const field of fields) {
    const current = env.get(field.key) ?? '';

    // JWT_SECRET fraco/ausente: oferece um gerado em vez de deixar escolha ruim
    if (field.key === 'JWT_SECRET' && !looksLikeSecret(current)) {
      const generate = await prompt.confirm('JWT_SECRET ausente/placeholder — gerar um forte?', {
        defaultValue: true,
      });
      if (generate) {
        const secret = generateSecret(32);
        env.set(field.key, secret);
        changed.add(field.key);
        prompt.success('JWT_SECRET gerado (48 hex, 32 bytes)');
        continue;
      }
    }

    prompt.write(`  ${style.dim(`${symbol.bullet} ${field.description}`)}\n`);

    let value: string;
    if (field.type === 'secret') {
      value = await prompt.secret(field.label, {
        default: current,
        placeholder: current ? maskValue(current) : '(não definido)',
        validate: (candidate) => validateField(field, candidate),
      });
    } else {
      const fallback = current || field.default || '';
      value = await prompt.ask(field.label, {
        default: fallback,
        placeholder: current ? current : field.default ? `${field.default} (default)` : undefined,
        validate: (candidate) => validateField(field, candidate),
      });
    }

    if (value !== current) {
      // Aceitar o default de uma chave ausente NÃO materializa a chave: o
      // aplicativo já aplica esse default, e gravar tudo a cada Enter enchi o
      // .env de ruído. Só persiste mudança explícita.
      const acceptedDefault = current === '' && value === (field.default ?? '');
      if (acceptedDefault) {
        prompt.info(`${field.key} não definida — vale o default ${value}`);
        continue;
      }

      env.set(field.key, value);
      changed.add(field.key);
      const shown = field.type === 'secret' ? maskValue(value) : value;
      prompt.success(`${field.key} → ${shown}`);
    }
  }
}
