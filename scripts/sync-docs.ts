// @oktis-works/cms - Regenera os guias de extensão em `docs/` (nas duas línguas)
//
// Fonte única: `packages/cli/src/scaffold-docs.ts` (`pluginDoc()` e
// `themeDoc()`) — é o mesmo conteúdo que o `okcms init` escreve em
// PLUGIN.md/THEME.md dentro do projeto. Este script projeta esses documentos
// em `docs/` com o banner de idioma (o scaffold gera UM arquivo, sem banner,
// porque lá só existe a língua escolhida no init).
//
//   bun scripts/sync-docs.ts
//
// Depois de editar scaffold-docs.ts, rode o script e commite os dois idiomas.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pluginDoc, themeDoc } from '../packages/cli/src/scaffold-docs';

const root = join(import.meta.dirname, '..');

const DOCS: Array<[string, (lang: 'en' | 'pt') => string]> = [
  ['plugin-development', pluginDoc],
  ['theme-development', themeDoc],
];

for (const [base, render] of DOCS) {
  const files: Array<[string, string]> = [
    [`${base}.md`, `> 📄 **English** · [Português](./${base}.pt-BR.md)\n\n${render('en')}`],
    [`${base}.pt-BR.md`, `> 📄 **Português (Brasil)** · [English](./${base}.md)\n\n${render('pt')}`],
  ];
  for (const [filename, content] of files) {
    writeFileSync(join(root, 'docs', filename), content, 'utf-8');
    console.log(`→ docs/${filename}`);
  }
}
