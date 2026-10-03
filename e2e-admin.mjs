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
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  // ---------- LOGIN ----------
  await page.goto(ADMIN + '/login', { waitUntil: 'networkidle' });
  await page.waitForSelector('#login-form');
  await page.fill('#email', 'admin@e2e.test');
  await page.fill('#password', 'senha12345');
  await page.fill('#tenant', 'default');
  await page.click('#login-form button[type="submit"]');
  await page.waitForURL(ADMIN + '/', { timeout: 10000 });
  await page.waitForTimeout(2000); // cookies do response do login
  expect(page.url().includes('3011'), true, 'login → redirect to /');

  // Cookies HttpOnly no browser (NÃO localStorage)
  const cookies = await context.cookies(API);
  const accessTokenCookie = cookies.find(c => c.name === 'access_token');
  const refreshTokenCookie = cookies.find(c => c.name === 'refresh_token');
  const csrfCookie = cookies.find(c => c.name === 'csrf_token');
  expect(!!accessTokenCookie && accessTokenCookie.httpOnly, true, 'access_token cookie HttpOnly presente');
  expect(!!refreshTokenCookie && refreshTokenCookie.httpOnly, true, 'refresh_token cookie HttpOnly presente');
  expect(!!csrfCookie && !csrfCookie.httpOnly, true, 'csrf_token cookie legível (double-submit)');
  // localStorage NÃO tem mais tokens
  const lsToken = await page.evaluate(() => localStorage.getItem('accessToken'));
  expect(lsToken, null, 'localStorage NÃO guarda mais accessToken');

  // ---------- DASHBOARD ----------
  await page.goto(ADMIN + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('h1:has-text("Dashboard")');
  await page.waitForSelector('text=Total Content');
  ok('dashboard carrega (island SSR + CSR)');

  // ---------- MEDIA ----------
  await page.goto(ADMIN + '/media', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Arraste arquivos aqui');
  ok('página /media abre');

  // upload PNG via input file (cookies HttpOnly enviados automaticamente)
  const fileInput = await page.$('input[type="file"]');
  await fileInput.setInputFiles({
    name: 'e2e-pw.png',
    mimeType: 'image/png',
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x0d, 0x0a]),
  });
  await page.waitForTimeout(2500);
  const mediaItems = await page.$$('.media-grid img, .media-grid .thumb, .media-grid [data-testid="media-item"], .media-grid .media-card');
  expect(mediaItems.length > 0, true, 'upload media aparece no grid');

  // ---------- USERS ----------
  await page.goto(ADMIN + '/users', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Nome');
  await page.waitForSelector('text=Email');
  ok('página /users lista usuários');

  // criar user via /users/new
  await page.goto(ADMIN + '/users/new', { waitUntil: 'networkidle' });
  await page.waitForSelector('label:has-text("Nome") input');
  await page.fill('label:has-text("Nome") input', 'Playwright E2E');
  await page.fill('input[type="email"]', 'playwright@e2e.test');
  await page.fill('input[type="password"]', 'senha12345');
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
  await page.waitForTimeout(1500);
  const saved = await page.inputValue('input[placeholder="Meu Site"]');
  expect(saved, 'Site Playwright', 'siteTitle salvo via UI (PUT com CSRF)');

  // ---------- CONTENT NEW ----------
  await page.goto(ADMIN + '/content/new', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Novo conteúdo');
  await page.fill('label:has-text("Título") input', 'Post Playwright');
  await page.fill('label:has-text("Slug") input', 'post-playwright');
  await page.fill('label:has-text("Resumo") textarea', 'Excerpt Playwright');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  ok('criação de conteúdo via UI');

  // ---------- LOGOUT ----------
  await page.click('#logout-btn');
  await page.waitForURL(ADMIN + '/login', { timeout: 8000 });
  expect(page.url().includes('/login'), true, 'logout → redirect login');

  // cookies limpos após logout
  const afterCookies = await context.cookies(API);
  const afterAccess = afterCookies.find(c => c.name === 'access_token');
  expect(!afterAccess, true, 'logout limpa access_token cookie');

  // ---------- SESSION GUARD ----------
  await page.goto(ADMIN + '/', { waitUntil: 'networkidle' });
  await page.waitForURL(ADMIN + '/login', { timeout: 10000 });
  ok('guard de sessão redireciona para login sem cookie');

  await browser.close();
  console.log('\n=== ADMIN E2E ===');
  console.log(`PASSOU=${PASS} FALHOU=${FAIL}`);
  if (FAIL > 0) process.exit(1);
}

main().catch(e => { console.error('ERRO:', e); process.exit(1); });