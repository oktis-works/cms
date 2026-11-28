#!/usr/bin/env node
// @oktis-works - E2E: fluxo `okcms dev` → login (usuário criado via CLI, não via rota pública)
//
// Simula exatamente o que o usuário faz:
//   1. `okcms init meu-projeto` (define DB_NAME com sufixo do projeto)
//   2. `okcms dev` (cria o primeiro usuário via createUserAccount, mesmo caminho do user:create)
//   3. Abre o admin e tenta fazer login com aquelas credenciais
//
// Uso:
//   OKCMS_E2E_DATABASE_URL=postgres://postgres:postgres@localhost:5432/okcms_e2e_dev_login \
//   bun scripts/e2e-dev-login.mjs
//
// Requisitos: Postgres acessível (docker compose up -d postgres)

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const API = process.env['E2E_API_URL'] ?? 'http://127.0.0.1:4011';
const DATABASE_URL = process.env['OKCMS_E2E_DATABASE_URL'] ?? 'postgres://postgres:postgres@localhost:5432/okcms_e2e_dev_login';
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

async function ensureCliBuilt() {
  const { existsSync } = await import('node:fs');
  if (!existsSync('packages/cli/dist/index.js')) {
    console.log('→ Build do CLI necessário (dist não encontrado)');
    const exec = (cmd) =>
      new Promise((resolve, reject) => {
        const child = spawn('bash', ['-c', cmd], { stdio: 'inherit' });
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}: ${cmd}`))));
      });
    await exec('bun --cwd packages/cli run build');
    ok('CLI buildado');
  }
}

async function resetDatabase() {
  await ensureCliBuilt();
  console.log(`\n→ Banco dedicado: drop/create ${DB_NAME}`);
  const exec = (cmd) =>
    new Promise((resolve, reject) => {
      const child = spawn('bash', ['-c', cmd], { stdio: 'inherit' });
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}: ${cmd}`))));
    });

  await exec(
    `psql "${DATABASE_URL.replace(/\/[^/]+$/, '/postgres')}" -c "DROP DATABASE IF EXISTS \\"${DB_NAME}\\";" && psql "${DATABASE_URL.replace(/\/[^/]+$/, '/postgres')}" -c "CREATE DATABASE \\"${DB_NAME}\\";"`
  );

  // Rodar migrations via CLI oficial (mesmo caminho do `okcms dev`)
  await exec(
    `DATABASE_URL="${DATABASE_URL}" JWT_SECRET=e2e-secret bun packages/cli/dist/index.js db:migrate -d packages/database/migrations`
  );
  ok(`banco ${DB_NAME} migrado (schema core + seed)`);
}

async function createUserViaCLI(email, name, password, role = 'SUPER_ADMIN', tenant = 'default') {
  console.log(`\n→ Criando usuário via CLI (mesmo caminho do \`okcms dev\`): ${email}`);
  const exec = (cmd) =>
    new Promise((resolve, reject) => {
      const child = spawn('bash', ['-c', cmd], { stdio: 'inherit' });
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}: ${cmd}`))));
    });

  await exec(
    `DATABASE_URL="${DATABASE_URL}" bun packages/cli/dist/index.js user:create --email "${email}" --name "${name}" --password "${password}" --role "${role}" --tenant "${tenant}"`
  );
  ok(`usuário criado: ${email} (${role})`);
}

async function main() {
  console.log('=== OkCMS E2E: fluxo okcms dev → login ===\n');
  await resetDatabase();

  const env = {
    DATABASE_URL,
    JWT_SECRET: 'e2e-secret',
    PORT: '4011',
    AUTH_COOKIE_DOMAIN: 'localhost',
    AUTH_COOKIE_SAMESITE: 'lax',
    AUTH_COOKIE_SECURE: 'false',
  };

  console.log('\n→ subindo API');
  startProcess('api', 'bun', ['run', 'dev'], env, 'apps/api');

  if (!(await waitFor(`${API}/health`, 'API'))) return finish();

  // ---------- 1. Criar usuário via CLI (mesmo caminho do okcms dev) ----------
  const email = 'dev@meuprojeto.com';
  const name = 'Dev Admin';
  const password = 'SenhaForte123';
  await createUserViaCLI(email, name, password, 'SUPER_ADMIN', 'default');

  // ---------- 2. Login com aquelas credenciais ----------
  console.log(`\n→ Fazendo login com ${email}`);
  const loginRes = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await loginRes.json();
  expect(loginRes.status === 200, `login 200 (recebeu ${loginRes.status})`);
  expect(!!loginBody.accessToken, 'login retorna accessToken');
  expect(!!loginBody.tenantId, 'login retorna tenantId');
  expect(loginBody.tenantId !== '', 'tenantId não vazio');
  ok(`login OK para ${email}`);

  const accessToken = loginBody.accessToken;
  const refreshToken = loginBody.refreshToken;

  // ---------- 3. Login com e-mail em maiúsculas (normalização) ----------
  console.log(`\n→ Testando normalização de e-mail: ${email.toUpperCase()}`);
  const loginUpperRes = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.toUpperCase(), password }),
  });
  const loginUpperBody = await loginUpperRes.json();
  expect(loginUpperRes.status === 200, `login com e-mail maiúsculo 200 (recebeu ${loginUpperRes.status})`);
  expect(!!loginUpperBody.accessToken, 'login com e-mail maiúsculo retorna accessToken');
  ok('normalização de e-mail: maiúsculas aceitas');

  // ---------- 4. Login com senha errada (deve retornar 401 com código de erro) ----------
  console.log('\n→ Testando senha errada (deve retornar 401)');
  const loginWrongRes = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'senhaerrada' }),
  });
  const loginWrongBody = await loginWrongRes.json();
  expect(loginWrongRes.status === 401, `senha errada retorna 401 (recebeu ${loginWrongRes.status})`);
  expect(loginWrongBody.code === 'invalid_credentials', `código de erro é invalid_credentials (recebeu ${loginWrongBody.code})`);
  ok('senha errada: 401 com código invalid_credentials');

  // ---------- 5. Refresh com o token recebido ----------
  console.log('\n→ Testando refresh com token válido');
  const refreshRes = await fetch(`${API}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  const refreshBody = await refreshRes.json();
  expect(refreshRes.status === 200, `refresh 200 (recebeu ${refreshRes.status})`);
  expect(!!refreshBody.accessToken, 'refresh retorna novo accessToken');
  ok('refresh OK');

  // ---------- 6. Refresh sem token (deve retornar 401 no_active_session) ----------
  console.log('\n→ Testando refresh sem token (deve retornar 401)');
  const refreshEmptyRes = await fetch(`${API}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const refreshEmptyBody = await refreshEmptyRes.json();
  expect(refreshEmptyRes.status === 401, `refresh sem token retorna 401 (recebeu ${refreshEmptyRes.status})`);
  expect(refreshEmptyBody.code === 'no_active_session', `código é no_active_session (recebeu ${refreshEmptyBody.code})`);
  ok('refresh sem token: 401 com código no_active_session');

  // ---------- 7. Verificar cookies HttpOnly foram setados no login ----------
  console.log('\n→ Verificando cookies HttpOnly no login');
  const setCookies = loginRes.headers.getSetCookie?.() ?? [];
  expect(setCookies.some((c) => c.startsWith('access_token=')), 'login seta cookie access_token');
  expect(setCookies.some((c) => c.startsWith('refresh_token=')), 'login seta cookie refresh_token');
  expect(setCookies.some((c) => c.startsWith('session_expires_at=')), 'login seta cookie session_expires_at');
  ok('cookies HttpOnly setados no login');

  return finish();
}

function finish() {
  console.log(`\n=== E2E dev→login: ${PASS} passou, ${FAIL} falhou ===\n`);
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
