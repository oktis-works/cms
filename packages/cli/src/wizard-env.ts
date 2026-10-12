// @oktis-works/cms - Wizard: entrevista de variáveis de ambiente
//
// Entrevista campo a campo das 47 variáveis do projeto (ENV_FIELDS é a fonte
// única de verdade — label, descrição, exemplo, tipo e validação vêm de lá).
// Regras, decididas com o usuário:
//
//   • TODOS os campos aparecem em todas as sessões (nada de "só os vazios");
//   • o valor atual é exibido (segredos mascarados) e Enter mantém;
//   • nada é gravado pela metade: as respostas ficam num PLANO em memória e o
//     `.env` só é salvo depois do resumo + confirmação finais;
//   • Ctrl+C no meio descarta o plano inteiro — mesma filosofia do config;
//   • o campo `when` é re-avaliado com as respostas já dadas: se a condição
//     deixou de valer (ex.: STORAGE_DRIVER voltou pra local), os dependentes
//     são pulados em vez de perguntar bobagem.
//
// A entrevista é usada como etapa dos fluxos guiados (dev/deploys) e como item
// de menu — nos fluxos o chamador oferece o "pular".

import { join } from 'node:path';
import {
  ENV_FIELDS,
  ENV_SECTIONS,
  fieldsForSection,
  sectionById,
  validateField,
  type EnvField,
} from './env-schema.js';
import { EnvFile, loadEnvFile } from './env-file.js';
import { generateSecret, looksLikeSecret } from './guards.js';
import { maskValue } from './config-wizard.js';
import { style, symbol, type Prompt } from './prompt.js';
import type { Catalog } from './wizard-i18n.js';

export interface InterviewDeps {
  prompt: Prompt;
  catalog: Catalog;
  cwd: string;
  /** Permite cancelar via Ctrl+C sem derrubar o processo inteiro. */
  onInterrupt?: () => void;
}

export interface InterviewResult {
  status: 'saved' | 'cancelled' | 'nothing';
  changed: string[];
}

/**
 * Roda a entrevista completa. `opts.skipOption` quando true adiciona a escolha
 * "pular" no primeiro prompt (contexto de fluxo guiado).
 */
export async function runEnvInterview(
  deps: InterviewDeps,
  opts: { skipOption?: boolean } = {}
): Promise<InterviewResult> {
  const { prompt, catalog, cwd } = deps;
  const path = join(cwd, '.env');
  const env = loadEnvFile(path);
  const changed = new Set<string>();

  prompt.heading(`${catalog.envHeading} — .env`);
  prompt.info(catalog.envIntro);

  if (opts.skipOption) {
    const pick = await prompt.select<'run' | 'skip'>('env', [
      { value: 'run', label: 'Configure variables', hint: catalog.envSectionCount(ENV_FIELDS.length) },
      { value: 'skip', label: catalog.envSkipOption },
    ]);
    if (pick === 'skip') return { status: 'nothing', changed: [] };
  }

  const interrupted = { value: false };
  const onInterrupt = (): void => {
    interrupted.value = true;
  };
  process.once('SIGINT', onInterrupt);

  try {
    // respostas parciais alimentam o `when` dos próximos campos
    const record = (): Record<string, string> => {
      const out = env.toRecord();
      for (const key of changed) out[key] = env.get(key) ?? '';
      return out;
    };

    for (const section of ENV_SECTIONS) {
      if (interrupted.value) break;

      // seção de banco: antes de tudo, pergunta o modo de conexão
      if (section.id === 'database') {
        const mode = await prompt.select<'connectionString' | 'individual'>(
          catalog.envDbModeChoose,
          [
            { value: 'connectionString', label: catalog.envDbModeConnectionString, hint: catalog.envDbModeConnectionStringHint },
            { value: 'individual', label: catalog.envDbModeIndividual, hint: catalog.envDbModeIndividualHint },
          ],
          { defaultValue: 'individual' }
        );

        if (mode === 'connectionString') {
          // modo string de conexão: pergunta DATABASE_URL + garante DB_PASSWORD para a infra
          const dbUrlField = ENV_FIELDS.find((f) => f.key === 'DATABASE_URL')!;
          await askField(prompt, catalog, env, changed, dbUrlField, record);

          // DB_PASSWORD é necessário para a infra local (POSTGRES_PASSWORD do compose)
          // mesmo quando usando DATABASE_URL externo — gera se não existir
          const currentPwd = env.get('DB_PASSWORD') ?? '';
          if (!currentPwd || !looksLikeSecret(currentPwd)) {
            const secret = generateSecret(24);
            env.set('DB_PASSWORD', secret);
            changed.add('DB_PASSWORD');
            prompt.success(`DB_PASSWORD gerado para a infra local: ${maskValue(secret)}`);
          }
          continue; // pula os campos DB_* individuais
        }
        // modo individual: segue o fluxo normal (campos DB_* com when)
      }

      const fields = fieldsForSection(section.id, record());
      if (fields.length === 0) continue;

      prompt.write(`\n${style.bold(`  ── ${section.title} ── ${style.dim(section.hint)}`)}\n`);
      prompt.info(catalog.envSectionCount(fields.length));

      for (const field of fields) {
        if (interrupted.value) break;
        await askField(prompt, catalog, env, changed, field, record);
      }
    }

    if (interrupted.value) {
      prompt.warn(catalog.envCancelled);
      return { status: 'cancelled', changed: [] };
    }

    if (changed.size === 0) {
      prompt.info('no changes — file untouched.');
      return { status: 'nothing', changed: [] };
    }

    // resumo antes de gravar — segredos sempre mascarados
    prompt.heading(catalog.envSummaryTitle);
    prompt.info(catalog.envSummaryPending(changed.size));
    for (const key of changed) {
      const field = ENV_FIELDS.find((candidate) => candidate.key === key);
      const value = env.get(key) ?? '';
      const shown = field?.type === 'secret' ? maskValue(value) : value;
      prompt.write(`    ${style.cyan(symbol.arrow)} ${key}=${shown}\n`);
    }

    const ok = await prompt.confirm(catalog.envConfirmSave(changed.size), { defaultValue: true });
    if (!ok) {
      prompt.warn(catalog.envDiscarded);
      return { status: 'cancelled', changed: [] };
    }

    env.save(path);
    prompt.success(catalog.envSaved(changed.size));
    return { status: 'saved', changed: [...changed] };
  } finally {
    process.removeListener('SIGINT', onInterrupt);
  }
}

/** Pergunta um campo com descrição/exemplo/valor atual — Enter mantém. */
async function askField(
  prompt: Prompt,
  catalog: Catalog,
  env: EnvFile,
  changed: Set<string>,
  field: EnvField,
  record: () => Record<string, string>
): Promise<void> {
  // o `when` pode ter mudado desde o início da seção (um campo alterou o
  // registro) — reavalia antes de perguntar, senão sai pergunta bobagem
  if (field.when && !field.when(record())) return;

  const current = env.get(field.key) ?? '';

  prompt.write(`\n  ${style.bold(field.key)}\n`);
  prompt.write(`    ${style.dim(symbol.bullet)} ${style.dim(field.label)}\n`);
  prompt.write(`    ${style.dim(symbol.bullet)} ${style.dim(field.description)}\n`);
  if (field.example) {
    prompt.write(`    ${style.gray(`  ex.: ${field.example}`)}\n`);
  }
  if (field.options && field.options.length > 0) {
    prompt.write(`    ${style.gray(`  options: ${field.options.join(' | ')}`)}\n`);
  }

  // JWT_SECRET fraco/ausente: oferece um gerado (mesma ajuda do config wizard)
  if (field.key === 'JWT_SECRET' && !looksLikeSecret(current)) {
    const generate = await prompt.confirm(catalog.envJwtGenerate, { defaultValue: true });
    if (generate) {
      const secret = generateSecret(32);
      env.set(field.key, secret);
      changed.add(field.key);
      prompt.success(catalog.envGenerated);
      return;
    }
  }

  const shownCurrent = field.type === 'secret'
    ? current
      ? maskValue(current)
      : catalog.envSecretNotSet
    : current || catalog.envSecretNotSet;

  const validate = (candidate: string): string | null => validateField(field, candidate);

  let value: string;
  if (field.type === 'secret') {
    value = await prompt.secret(`${field.key} — ${field.label}`, {
      default: current,
      placeholder: `${catalog.envKeepHint}: ${shownCurrent}`,
      validate,
    });
  } else {
    const fallback = current || field.default || '';
    value = await prompt.ask(`${field.key} — ${field.label}`, {
      default: fallback,
      placeholder: current
        ? `${catalog.envKeepHint}: ${current}`
        : field.default
          ? `${field.default} (default)`
          : undefined,
      validate,
    });
  }

  if (value === current) return;

  // aceitar o default de uma chave AUSENTE não materializa a chave — o app já
  // aplica esse default; gravar tudo a cada Enter enche o .env de ruído
  const acceptedDefault = current === '' && value === (field.default ?? '');
  if (acceptedDefault) {
    prompt.info(catalog.envDefaultApplies(value));
    return;
  }

  env.set(field.key, value);
  changed.add(field.key);
  const shown = field.type === 'secret' ? maskValue(value) : value;
  prompt.success(`${field.key} → ${shown}`);
}

/** Seção do env-schema usada pela entrevista (para testes/docs). */
export function interviewSectionCount(sectionId: string): EnvField[] {
  return sectionById(sectionId) ? fieldsForSection(sectionId, {}) : [];
}
