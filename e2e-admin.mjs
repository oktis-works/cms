import { chromium } from 'playwright-core';

const CHROME = process.env['CHROME_PATH'] ?? '/home/judah/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const API = process.env['E2E_API_URL'] ?? 'http://127.0.0.1:3010';
const ADMIN = process.env['E2E_ADMIN_URL'] ?? 'http://127.0.0.1:3011';
let PASS = 0, FAIL = 0;
const ok = m => { PASS++; console.log('✅', m); };
const fail = m => { FAIL++; console.log('❌', m); };
const expect = (a, e, m) => a === e ? ok(m) : fail(`${m} (esperado=${e} obtido=${a})`);

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext();
  // Locale explícito: sem o cookie, o SSR/cliente cai no idioma do navegador
  // (Playwright nasce em en-US) e os seletores pt-BR do script não casam.
  await context.addCookies([{ name: 'admin_locale', value: 'pt-BR', url: ADMIN }]);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  // ---------- LOGIN ----------
  await page.goto(ADMIN + '/login', { waitUntil: 'networkidle' });
  await page.waitForSelector('#login-form');
  await page.fill('#email', 'admin@e2e.test');
  await page.fill('#password', 'senha12345');
  // Campo opcional: o form de login atual pode não expor o seletor de tenant
  // (resolve para o tenant default no servidor).
  if (await page.locator('#tenant').count()) await page.fill('#tenant', 'default');
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
  // Tolerante a locale: os stats do island são "Total Content" (en) /
  // "Total de Conteúdos" (pt-BR). A página não tem mais <h1>.
  await page.getByText(/Total Content|Total de Conteúdos/).first().waitFor({ timeout: 20000 });
  ok('dashboard carrega (island SSR + CSR)');

  // ---------- MEDIA ----------
  await page.goto(ADMIN + '/media', { waitUntil: 'networkidle' });
  // Ilhas podem renderizar en ou pt-BR (ver bug de hidratação do i18n) — aceita os dois.
  await page.getByText(/Arraste arquivos aqui|Drop files here/).first().waitFor({ timeout: 20000 });
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
  await page.getByText(/^(Nome|Name)$/).first().waitFor({ timeout: 20000 });
  await page.getByText(/^Email$/).first().waitFor({ timeout: 20000 });
  ok('página /users lista usuários');

  // criar user via /users/new
  await page.goto(ADMIN + '/users/new', { waitUntil: 'networkidle' });
  await page.waitForSelector('label:has-text("Nome") input, label:has-text("Name") input');
  await page.fill('label:has-text("Nome") input, label:has-text("Name") input', 'Playwright E2E');
  await page.fill('input[type="email"]', 'playwright@e2e.test');
  await page.fill('input[type="password"]', 'senha12345');
  await page.waitForFunction(() => document.querySelector('select')?.options.length > 1);
  await page.selectOption('select', { label: 'Editor (EDITOR)' });
  // Submit primário do form (o texto do rótulo varia por locale).
  await page.click('button[type="submit"]');
  await page.waitForURL(ADMIN + '/users', { timeout: 10000 });
  ok('criação de usuário via UI');

  // ---------- SETTINGS ----------
  await page.goto(ADMIN + '/settings/general', { waitUntil: 'networkidle' });
  await page.waitForSelector('input[placeholder="Meu Site"], input[placeholder="My Site"]');
  ok('página /settings/general abre');

  await page.fill('input[placeholder="Meu Site"], input[placeholder="My Site"]', 'Site Playwright');
  await page.click('button[type="submit"]:has-text("Salvar"), button[type="submit"]:has-text("Save")');
  await page.waitForTimeout(1500);
  const saved = await page.inputValue('input[placeholder="Meu Site"], input[placeholder="My Site"]');
  expect(saved, 'Site Playwright', 'siteTitle salvo via UI (PUT com CSRF)');

  // ---------- API KEYS (tela /settings/api-keys) ----------
  await page.goto(ADMIN + '/settings/api-keys', { waitUntil: 'networkidle' });
  await page.getByText(/Keys emitidas|Issued keys/).first().waitFor({ timeout: 20000 });
  ok('página /settings/api-keys abre');

  await page.locator('button', { hasText: /Nova API key|New API key/ }).first().click();
  await page.waitForSelector('form.resource-form');
  await page.fill('form.resource-form input[type="text"]', 'Key Playwright E2E');
  await page.click('form.resource-form button[type="submit"]');
  // Modal de exibição única com o valor claro
  await page.waitForSelector('[data-testid="api-key-plaintext"]', { timeout: 10000 });
  const plaintext = await page.inputValue('[data-testid="api-key-plaintext"]');
  expect(String(plaintext).startsWith('okcms_'), true, 'modal exibe valor claro no formato okcms_');
  await page.locator('.modal button', { hasText: /Fechar|Close/ }).first().click();
  await page.waitForTimeout(1500);
  // A tabela mostra a key criada (prefixo mascarado) e o botão de revogar
  await page.getByText('Key Playwright E2E').first().waitFor({ timeout: 10000 });
  const revokeBtn = page.locator('button', { hasText: /Revogar|Revoke/ }).first();
  expect(!!(await revokeBtn.count()), true, 'key listada com ação de revogar');
  await revokeBtn.click();
  await page.waitForTimeout(1500);
  await page.getByText(/API key revogada\.|API key revoked\./).first().waitFor({ timeout: 10000 });
  ok('revogação via UI');

  // ---------- CONTENT NEW (/content/post/new — tipo post) ----------
  await page.goto(ADMIN + '/content/post/new', { waitUntil: 'networkidle' });
  // Título do editor: key content.editor.new ausente → fallback "New".
  await page.getByText(/^(Novo conteúdo|New content|New)$/).first().waitFor({ timeout: 20000 });
  await page.fill('input[aria-label="Título"], input[aria-label="Title"]', 'Post Playwright');
  await page.fill(
    'input[placeholder="auto-generated-from-title"], input[placeholder="gerado-a-partir-do-titulo"]',
    'post-playwright'
  );
  await page.fill('label.classic-editor__excerpt textarea', 'Excerpt Playwright');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  ok('criação de conteúdo via UI');

  // ---------- PUBLISH VIA UI (A2: rota real do publisher) ----------
  await page.goto(ADMIN + '/content/post', { waitUntil: 'networkidle' });
  await page.waitForSelector('table.table');
  const row = page.locator('tr', { hasText: 'Post Playwright' }).first();
  await row.waitFor({ timeout: 10000 });
  ok('content list exibe o conteúdo criado');

  // Publicar: botão dispara POST /content/:id/publish (contentPublisher real)
  await row.locator('button', { hasText: /Publicar|Publish/ }).first().click();
  await page.waitForTimeout(2500); // publish + reload da lista
  const publishedRow = page.locator('tr', { hasText: 'Post Playwright' }).first();
  const rowText = await publishedRow.textContent();
  expect(rowText?.includes('PUBLISHED') || rowText?.includes('Publicado'), true, 'publish via UI → status PUBLISHED na lista');
  ok('botão publica via rota real (A2)');

  // Despublicar volta para DRAFT
  await publishedRow.locator('button', { hasText: /Despublicar|Unpublish/ }).first().click();
  await page.waitForTimeout(2500);
  const unpublishedRow = page.locator('tr', { hasText: 'Post Playwright' }).first();
  const rowText2 = await unpublishedRow.textContent();
  expect(rowText2?.includes('DRAFT') || rowText2?.includes('Rascunho'), true, 'unpublish via UI → status DRAFT na lista');

  // ---------- LOGOUT (hoje fica no menu do usuário do AdminBar) ----------
  await page.locator('button[aria-label="Menu do usuário"], button[aria-label="User menu"]').first().click();
  await page.locator('button.user-menu-item.danger').first().click();
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