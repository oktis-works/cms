// @oktis-works/cms - Atualização de documentação do projeto no `okcms update`
//
// Detecta a língua do projeto (pelos arquivos existentes) e atualiza
// README.md, PLUGIN.md, THEME.md apenas se o conteúdo mudou.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { projectReadme, pluginDoc, themeDoc, detectProjectDocsLang } from './scaffold-docs.js';

export const PROJECT_DOCS = ['README.md', 'PLUGIN.md', 'THEME.md'] as const;
export type ProjectDocName = typeof PROJECT_DOCS[number];

/** Gera o hash do conteúdo (para comparação sem reescrita). */
function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Atualiza um único arquivo de documentação se mudou. Retorna true se escreveu. */
function updateDocFile(
  cwd: string,
  name: ProjectDocName,
  generator: (lang: 'en' | 'pt') => string,
  lang: 'en' | 'pt'
): boolean {
  const path = join(cwd, name);
  const newContent = generator(lang);
  const newHash = hash(newContent);

  if (existsSync(path)) {
    const oldContent = readFileSync(path, 'utf-8');
    const oldHash = hash(oldContent);
    if (oldHash === newHash) return false; // idêntico — não reescreve
  }

  writeFileSync(path, newContent, 'utf-8');
  return true;
}

/**
 * Atualiza README.md, PLUGIN.md e THEME.md do projeto para a versão atual
 * da CLI, preservando a língua do projeto.
 *
 * @returns lista de arquivos que foram reescritos (vazia se nenhum mudou)
 */
export function updateProjectDocs(cwd: string): string[] {
  const lang = detectProjectDocsLang(cwd);
  const updated: string[] = [];

  if (updateDocFile(cwd, 'README.md', projectReadme, lang)) updated.push('README.md');
  if (updateDocFile(cwd, 'PLUGIN.md', pluginDoc, lang)) updated.push('PLUGIN.md');
  if (updateDocFile(cwd, 'THEME.md', themeDoc, lang)) updated.push('THEME.md');

  return updated;
}