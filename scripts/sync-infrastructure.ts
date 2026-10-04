// @oktis-works/cms - Sincroniza os assets canônicos para `infrastructure/`
//
// Fonte única: `packages/cli/src/assets.ts` (é o que a CLI publicada escreve
// nos projetos dos operadores). Este script projeta os mesmos bytes em
// `infrastructure/**` para quem lê/audita o deploy sem passar pela CLI.
//
//   bun scripts/sync-infrastructure.ts
//
// O teste `packages/cli/src/assets.test.ts` falha se os dois lados divergirem
// — ou seja, se alguém editar só um dos lados.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  ASSET_MIRROR,
  COMPOSE_DEPLOY,
  COMPOSE_INFRA,
  DOCKERFILE,
  DOCKERIGNORE,
  ENTRYPOINT_SH,
  NGINX_TEMPLATE,
} from '../packages/cli/src/assets';

const root = join(import.meta.dirname, '..');

const files: Array<{ path: string; content: string; mode?: number }> = [
  { path: ASSET_MIRROR.dockerfile, content: DOCKERFILE },
  { path: ASSET_MIRROR.entrypoint, content: ENTRYPOINT_SH, mode: 0o755 },
  { path: ASSET_MIRROR.dockerignore, content: DOCKERIGNORE },
  { path: ASSET_MIRROR.composeInfra, content: COMPOSE_INFRA },
  { path: ASSET_MIRROR.composeDeploy, content: COMPOSE_DEPLOY },
  { path: ASSET_MIRROR.nginxTemplate, content: NGINX_TEMPLATE },
];

for (const file of files) {
  const target = join(root, file.path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, file.content, { encoding: 'utf-8', mode: file.mode ?? 0o644 });
  console.log(`✓ ${file.path}`);
}
