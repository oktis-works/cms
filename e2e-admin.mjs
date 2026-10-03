import { chromium } from 'playwright-core';

const CHROME = '/home/judah/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const API = 'http://127.0.0.1:3010';
const ADMIN = 'http://127.0.0.1:3011';
let PASS = 0, FAIL = 0;
const ok = m => { PASS++; console.log('✅', m); };
const fail = m => { FAIL++; console.log('❌', m); };
const expect = (a, e, m) => a === e ? ok(m) : fail(`${m} (esperado=${e} obtido=${a})`);

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);

  // ---------- LOGIN ----------
  await page.goto(ADMIN + '/login', { waitUntil: 'networkidle' });
  await page.waitForSelector('#login-form');
  await page.fill('#email', 'admin@e2e.test');
  await page.fill('#password', 'senha12345');
  await page.fill('#tenant', 'default');
  await page.click('#login-form button[type="submit"]');
  await page.waitForURL(ADMIN + '/', { timeout: 10000 });
  expect(page.url().endsWith('/') || page.url().endsWith('/'), true, 'login → redirect to /');

  // token salvo no localStorage
  const token = await page.evaluate(() => localStorage.getItem('accessToken'));
  expect(typeof token, 'string', 'accessToken salvo no localStorage');
  const tenantId = await page.evaluate(() => localStorage.getItem('tenantId'));
  expect(typeof tenantId, 'string', 'tenantId salvo no localStorage');

  // ---------- DASHBOARD ----------
  await page.goto(ADMIN + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('h1:has-text("Dashboard")');
  await page.waitForSelector('text=Total Content');
  ok('dashboard carrega (island SSR + CSR)');

  // ---------- MEDIA ----------
  await page.goto(ADMIN + '/media', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Arraste arquivos aqui');
  ok('página /media abre');

  // upload PNG pequeno via input file
  const fileInput = await page.$('input[type="file"]');
  await fileInput.setInputFiles({
    name: 'e2e.png',
    mimeType: 'image/png',
    buffer: Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,'E2E-PNG-BYTES'.charCodeAt(0)])
  });
  await page.waitForTimeout(1000);
  // verifica toast ou grid atualizado
  const mediaItems = await page.$$('.media-grid img, .media-grid .thumb, .media-grid [data-testid="media-item"]');
  expect(mediaItems.length > 0, true, 'upload media aparece no grid');

  // ---------- USERS ----------
  await page.goto(ADMIN + '/users', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Nome');
  await page.waitForSelector('text=Email');
  await page.waitForSelector('text=Papel');
  ok('página /users lista usuários');

  // criar novo user (página /users/new)
  await page.goto(ADMIN + '/users/new', { waitUntil: 'networkidle' });
  await page.waitForSelector('label:has-text("Nome") input');
  await page.fill('label:has-text("Nome") input', 'Playwright E2E');
  await page.fill('input[type="email"]', 'playwright@e2e.test');
  await page.fill('input[type="password"]', 'senha12345');
  // aguarda roles carregarem no select (onMount assíncrono)
  await page.waitForFunction(() => document.querySelector('select')?.options.length > 1);
  await page.selectOption('select', { label: 'Editor (EDITOR)' });
  await page.click('button[type="submit"]:has-text("Criar usuário")');
  await page.waitForURL(ADMIN + '/users', { timeout: 10000 });
  ok('criação de usuário via UI');

  // ---------- SETTINGS ----------
  await page.goto(ADMIN + '/settings/general', { waitUntil: 'networkidle' });
  await page.waitForSelector('input[placeholder="Meu Site"]');
  ok('página /settings/general abre');

  await page.fill('input[placeholder="Meu Site"]', 'Site Playwright');
  await page.click('button[type="submit"]:has-text("Salvar")');
  await page.waitForTimeout(1000);
  const saved = await page.inputValue('input[placeholder="Meu Site"]');
  expect(saved, 'Site Playwright', 'siteTitle salvo via UI');

  // ---------- CONTENT NEW ----------
  await page.goto(ADMIN + '/content/new', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Novo conteúdo');
  // type select (post/page) - assume 'post' default
  await page.fill('label:has-text("Título") input', 'Post Playwright');
  await page.fill('label:has-text("Slug") input', 'post-playwright');
  await page.fill('label:has-text("Resumo") textarea', 'Excerpt Playwright');
  await page.click('button[type="submit"]:has-text("Salvar"), button:has-text("Publicar")');
  await page.waitForTimeout(1500);
  ok('criação de conteúdo via UI');

  // ---------- LOGOUT ----------
  await page.click('#logout-btn');
  await page.waitForURL(ADMIN + '/login', { timeout: 5000 });
  expect(page.url().includes('/login'), true, 'logout → redirect login');

  // ---------- SESSION GUARD ----------
  await page.goto(ADMIN + '/', { waitUntil: 'networkidle' });
  await page.waitForURL(ADMIN + '/login');
  ok('guard de sessão redireciona para login sem token');

  await browser.close();
  console.log('\n=== ADMIN E2E ===');
  console.log(`PASSOU=${PASS} FALHOU=${FAIL}`);
  if (FAIL > 0) process.exit(1);
}

main().catch(e => { console.error('ERRO:', e); process.exit(1); });