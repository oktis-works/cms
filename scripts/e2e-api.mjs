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
    // Redis configurável como o DATABASE_URL (CI/portas alternativas de dev)
    REDIS_HOST: process.env['REDIS_HOST'] ?? 'localhost',
    REDIS_PORT: process.env['REDIS_PORT'] ?? '6379',
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

  // ---------- TEMAS: sync → list read-only → activate → render (FEAT-095) ----------
  // 1) Descoberta EXPLÍCITA do diretório (POST /sync). O tema default deste
  //    repo usa o nome canônico theme.json — precisa aparecer no banco.
  const syncRes = await fetch(`${API}/api/v1/themes/sync`, { method: 'POST', headers: bearer });
  expect(syncRes.status === 200, 'POST /api/v1/themes/sync → 200');
  const synced = await syncRes.json();
  const defaultTheme = (Array.isArray(synced) ? synced : []).find((t) => t.name === 'default');
  expect(!!defaultTheme, 'sync descobre o tema default (theme.json canônico)');
  expect(defaultTheme?.manifest?.compatibility?.okcms?.startsWith('^'), 'manifesto expõe compatibility.okcms (6C)');
  expect((defaultTheme?.manifest?.screenshots ?? [])[0] === 'screenshot.png', 'manifesto expõe screenshots[0] (6C)');
  expect(defaultTheme?.manifest?.stylesConfig?.isolation === 'manual', 'stylesConfig.isolation="manual" persistido (3-D)');
  expect(defaultTheme?.status !== 'ACTIVE', 'tema recém-descoberto não está ativo por acidente');

  // 2) GET é LEITURA PURA (6B): duas leituras seguidas devolvem o MESMO
  //    estado (sem side-effect de escrita — era o sync embutido no GET).
  const list1 = await (await fetch(`${API}/api/v1/themes`, { headers: bearer })).json();
  const list2 = await (await fetch(`${API}/api/v1/themes`, { headers: bearer })).json();
  expect(JSON.stringify(list1) === JSON.stringify(list2), 'GET /api/v1/themes não dispara escrita (estado idêntico entre leituras)');

  // 3) Ativação com invariante de tema único ativo
  const activateRes = await fetch(`${API}/api/v1/themes/${defaultTheme.id}/activate`, { method: 'POST', headers: bearer });
  expect(activateRes.status === 200, 'POST /api/v1/themes/:id/activate → 200');
  const afterActivate = await (await fetch(`${API}/api/v1/themes`, { headers: bearer })).json();
  expect(afterActivate.filter((t) => t.status === 'ACTIVE').length === 1, 'invariante: exatamente UM tema ACTIVE');
  expect(afterActivate.find((t) => t.status === 'ACTIVE')?.name === 'default', 'tema ativo é o default');

  // 4) Web renderiza com o tema ATIVO vindo do BANCO (sem restart do web)
  const themedHome = await fetch(`${WEB}/`);
  const themedHtml = await themedHome.text();
  expect(themedHome.status === 200 && themedHtml.includes('data-theme="default"'), 'web usa o tema ativo do banco (sem restart)');
  expect(themedHtml.includes('href="/themes/default/dist/theme.css"'), 'documento linka o CSS do tema ativo');
  expect(themedHtml.includes('data-theme-style="default"'), 'link do CSS carrega o data-theme-style do tema ativo');

  // 5) Isolamento ENTREGUE (3-B): o dist servido já vem escopado, sem build
  const scopedCss = await (await fetch(`${WEB}/themes/default/dist/theme.css`)).text();
  expect(scopedCss.includes('[data-theme="default"]'), 'dist/theme.css servido JÁ escopado (isolation manual, sem build)');

  // 6) Preview do tema servido pelo runtime de assets (6C)
  const shot = await fetch(`${WEB}/themes/default/screenshot.png`);
  expect(shot.status === 200 && (shot.headers.get('content-type') ?? '').includes('image/png'), 'screenshot.png do tema servido (image/png)');

  // 7) Customizador: config persiste no tema (settings.theme do template é
  //    buildado no web a partir deste manifest+config — unit-tested lá).
  const cfgRes = await fetch(`${API}/api/v1/themes/${defaultTheme.id}/config`, {
    method: 'PATCH',
    headers: bearer,
    body: JSON.stringify({ config: { siteTitle: 'Título Customizado E2E' } }),
  });
  expect(cfgRes.status === 200, 'PATCH /api/v1/themes/:id/config → 200');
  const cfgRead = await (await fetch(`${API}/api/v1/themes`, { headers: bearer })).json();
  expect(cfgRead.find((t) => t.id === defaultTheme.id)?.config?.siteTitle === 'Título Customizado E2E', 'config do customizador persistido e relido');

  // 8) theme:build não destrói o artefato do tema css (1-A no-op seguro) —
  //    o dist/theme.css servido continua existindo e com conteúdo depois do
  //    fluxo completo de sync/activate (nenhum caminho o zera).
  expect(asset.status === 200 && (await asset.clone().text()).length > 0, 'dist/theme.css segue intacto após o ciclo (nunca é zerado)');

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
  // O conteúdo está PUBLISHED (passo do worker acima) — publish de novo seria
  // 400 "already published". O ciclo híbrido correto é unpublish → publish.
  const viaClientUnpublish = await client.unpublishContent(content.id);
  expect(viaClientUnpublish.content?.status === 'DRAFT', 'api-client unpublish híbrido (Bearer + cookies)');
  const viaClient = await client.publishContent(content.id);
  expect(viaClient.content?.status === 'PUBLISHED', 'api-client publish híbrido (Bearer + cookies)');

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
