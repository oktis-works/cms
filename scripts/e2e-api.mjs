#!/usr/bin/env node
// @oktis-works - E2E API: ciclo completo com banco fresco (drop/create/migrate)
//
// Fase E2 do TODO: publicação real (publisher), fila (worker), renderização
// do site público (tema + settings) e assets do tema.
//
// Uso: node scripts/e2e-api.mjs
// Requisitos: Postgres + Redis acessíveis (docker compose up -d postgres redis)

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const API = process.env['E2E_API_URL'] ?? 'http://127.0.0.1:4010';
const WEB = process.env['E2E_WEB_URL'] ?? 'http://127.0.0.1:4012';
const API_PORT = new URL(API).port;
const WEB_PORT = new URL(WEB).port;

const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgres://okcms:okcms_dev@localhost:5432/okcms_e2e';
const DB_NAME = new URL(DATABASE_URL).pathname.replace(/^\//, '');

let PASS = 0;
let FAIL = 0;
const ok = (m) => { PASS++; console.log('✅', m); };
const fail = (m) => { FAIL++; console.log('❌', m); };
const expect = (cond, m) => (cond ? ok(m) : fail(m));

const children = [];
function startProcess(name, command, args, env, cwd) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => process.stdout.write(`[${name}] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`));
  children.push(child);
  return child;
}

async function waitFor(url, label, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // ainda não subiu
    }
    await sleep(1000);
  }
  fail(`${label} não ficou pronto em ${attempts}s`);
  return false;
}

async function resetDatabase() {
  console.log(`\n→ Banco fresco: drop/create ${DB_NAME}`);
  const exec = (cmd) =>
    new Promise((resolve, reject) => {
      const child = spawn('bash', ['-c', cmd], { stdio: 'inherit' });
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}: ${cmd}`))));
    });

  // drop/create via psql no container (usuário postgres local do compose)
  await exec(
    `docker compose exec -T postgres psql -U okcms -d postgres -c "DROP DATABASE IF EXISTS \\"${DB_NAME}\\";" && docker compose exec -T postgres psql -U okcms -d postgres -c "CREATE DATABASE \\"${DB_NAME}\\";"`
  );

  // schema core + seed (roles da política RBAC + settings) via CLI oficial
  await exec(
    `DATABASE_URL="${DATABASE_URL}" JWT_SECRET=e2e-secret bun packages/cli/dist/index.js db:migrate -d packages/database/migrations`
  );
  ok(`banco ${DB_NAME} migrado (schema core + seed)`);
}

async function main() {
  console.log('=== OkCMS E2E API — ciclo completo (banco fresco) ===\n');
  await resetDatabase();

  const env = {
    DATABASE_URL,
    JWT_SECRET: 'e2e-secret',
    PORT: API_PORT,
    WEB_PORT,
    ACTIVE_THEME: 'default',
    THEMES_DIR: new URL('../themes', import.meta.url).pathname,
    UPLOAD_DIR: 'uploads-e2e',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
  };

  console.log('\n→ subindo api, web e worker');
  startProcess('api', 'bun', ['run', 'dev'], { ...env, PORT: API_PORT }, 'apps/api');
  startProcess('web', 'bun', ['run', 'dev'], { ...env, WEB_PORT, PORT: API_PORT }, 'apps/web');
  startProcess('worker', 'bun', ['run', 'dev'], env, 'apps/worker');

  if (!(await waitFor(`${API}/health`, 'API'))) return finish();
  if (!(await waitFor(`${WEB}/health`, 'web'))) return finish();
  ok('api + web no ar');

  // ---------- REGISTER + LOGIN (híbrido: tokens no body E cookies) ----------
  const registerRes = await fetch(`${API}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'e2e-api@test.local', password: 'senha12345', name: 'E2E API' }),
  });
  expect(registerRes.status === 201, 'register 201');
  const registerBody = await registerRes.json();
  expect(!!registerBody.accessToken && !!registerBody.refreshToken, 'register retorna tokens no body (A1)');
  const setCookies = registerRes.headers.getSetCookie?.() ?? [];
  expect(setCookies.some((c) => c.startsWith('access_token=')), 'register seta cookies HttpOnly (A1)');

  const loginRes = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'e2e-api@test.local', password: 'senha12345', tenantId: registerBody.tenantId ?? 'default' }),
  });
  const loginBody = await loginRes.json();
  expect(loginRes.status === 200 && !!loginBody.accessToken, 'login retorna tokens no body');
  const bearer = { Authorization: `Bearer ${loginBody.accessToken}`, 'Content-Type': 'application/json' };

  // ---------- REFRESH híbrido via body (API-first) ----------
  const refreshRes = await fetch(`${API}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: loginBody.refreshToken }),
  });
  const refreshBody = await refreshRes.json();
  expect(refreshRes.status === 200 && !!refreshBody.accessToken, 'refresh híbrido via body (A1)');

  // ---------- SETTINGS: título/descrição do site ----------
  const settingsRes = await fetch(`${API}/api/v1/settings`, {
    method: 'PUT',
    headers: bearer,
    body: JSON.stringify([
      { key: 'siteTitle', value: 'E2E Site Title', group: 'general', type: 'string' },
      { key: 'siteDescription', value: 'Descrição E2E do site', group: 'general', type: 'string' },
    ]),
  });
  expect(settingsRes.ok, 'settings salvas (siteTitle/siteDescription)');

  // ---------- CONTENT: create → publish → web renderiza ----------
  const createRes = await fetch(`${API}/api/v1/content`, {
    method: 'POST',
    headers: bearer,
    body: JSON.stringify({
      type: 'post',
      title: 'Primeiro Post E2E',
      slug: 'primeiro-post-e2e',
      status: 'DRAFT',
      body: { html: '<p>Conteúdo <strong>real</strong> do post.</p>', excerpt: 'Resumo do post E2E' },
    }),
  });
  expect(createRes.status === 201, 'content criado (DRAFT)');
  const content = await createRes.json();

  // Antes do publish: site NÃO renderiza (status DRAFT → 404)
  const beforePublish = await fetch(`${WEB}/${content.slug}`);
  expect(beforePublish.status === 404, 'rascunho não aparece no site público');

  const publishRes = await fetch(`${API}/api/v1/content/${content.id}/publish`, { method: 'POST', headers: bearer });
  expect(publishRes.status === 200, 'POST /content/:id/publish → 200 (A2)');
  const publishBody = await publishRes.json();
  expect(publishBody.content?.status === 'PUBLISHED', 'status PUBLISHED via contentPublisher');
  expect(Number(publishBody.content?.version) >= 2, 'version incrementada (revision snapshot)');

  // Revisão persistida
  const versionsRes = await fetch(`${API}/api/v1/content/${content.id}/versions`, { headers: bearer });
  const versions = await versionsRes.json();
  expect(Array.isArray(versions) && versions.length >= 1, 'revision snapshot criada (content_versions)');

  // Web renderiza conteúdo REAL (template do tema + settings)
  const page = await fetch(`${WEB}/${content.slug}`);
  expect(page.status === 200, 'site público 200 para conteúdo publicado');
  const html = await page.text();
  expect(html.includes('Primeiro Post E2E'), 'render injeta title do conteúdo (B1)');
  expect(html.includes('Conteúdo <strong>real</strong> do post.'), 'render injeta body/campos RAW (B1)');
  expect(html.includes('E2E Site Title'), 'title/meta usa siteTitle das settings (fim do OkCMS hardcoded)');
  expect(html.includes('Descrição E2E do site'), 'meta description = siteDescription');

  // Home do tema: título das settings
  const home = await fetch(`${WEB}/`);
  const homeHtml = await home.text();
  expect(home.status === 200 && homeHtml.includes('E2E Site Title'), 'home renderiza com siteTitle');

  // ---------- ASSETS DO TEMA (B2) ----------
  const asset = await fetch(`${WEB}/themes/default/dist/theme.css`);
  expect(asset.status === 200 && (asset.headers.get('content-type') ?? '').includes('text/css'), 'GET /themes/* serve CSS do tema');
  const traversal = await fetch(`${WEB}/themes/default/../../../.env`);
  expect(traversal.status === 404, 'traversal guard nega escape do diretório do tema');

  // ---------- UNPUBLISH ----------
  const unpublishRes = await fetch(`${API}/api/v1/content/${content.id}/unpublish`, { method: 'POST', headers: bearer });
  expect(unpublishRes.status === 200, 'POST /content/:id/unpublish → 200 (A2)');
  const afterUnpublish = await fetch(`${WEB}/${content.slug}`);
  expect(afterUnpublish.status === 404, 'despublicado sai do site público');

  // ---------- PUBLISH ASSÍNCRONO (fila A3 + worker) ----------
  const asyncRes = await fetch(`${API}/api/v1/content/${content.id}/publish?mode=async`, { method: 'POST', headers: bearer });
  const asyncBody = await asyncRes.json();
  expect(asyncRes.status === 202 && asyncBody.queued === true, 'publish ?mode=async enfileira (A3)');

  // Worker processa o job → site volta a exibir
  let renderedAfterQueue = false;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const res = await fetch(`${WEB}/${content.slug}`);
    if (res.status === 200) {
      renderedAfterQueue = true;
      break;
    }
  }
  expect(renderedAfterQueue, 'worker processa content.publish → conteúdo volta ao site (fila real)');

  // ---------- API-CLIENT híbrido (cookies + Bearer) via Node fetch ----------
  const { OkCMSClient } = await import('@oktis-works/api-client');
  const client = new OkCMSClient(API);
  await client.login('e2e-api@test.local', 'senha12345', registerBody.tenantId ?? 'default');
  const viaClient = await client.publishContent(content.id);
  expect(viaClient.content?.status === 'PUBLISHED', 'api-client publish/unpublish híbrido (Bearer + cookies)');

  return finish();
}

function finish() {
  console.log(`\n=== E2E API: ${PASS} passou, ${FAIL} falhou ===\n`);
  for (const child of children) {
    child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(FAIL > 0 ? 1 : 0), 500);
}

process.on('SIGINT', finish);
main().catch((error) => {
  console.error('E2E falhou:', error);
  finish();
});
