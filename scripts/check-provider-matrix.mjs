import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const fail = (message) => { throw new Error(message); };
const packageJson = JSON.parse(readFileSync(join(root, 'packages/database/package.json'), 'utf8'));
for (const dependency of ['postgres', 'mysql2', 'mariadb']) {
  if (!packageJson.dependencies?.[dependency]) fail(`provider driver dependency missing: ${dependency}`);
}
for (const file of ['schema.sql', 'schema.mysql.sql', 'schema.mariadb.sql']) {
  if (!existsSync(join(root, 'packages/database/src/schema', file))) fail(`provider schema missing: ${file}`);
}
for (const provider of ['mysql', 'mariadb']) {
  const dir = join(root, 'migrations', provider);
  const files = readdirSync(dir).filter((file) => file.endsWith('.sql'));
  if (files.length !== 25) fail(`${provider} migration set has ${files.length} files, expected 25`);
  if (!files.every((file) => readFileSync(join(dir, file), 'utf8').includes(`provider=${provider}`))) fail(`${provider} migration set contains a provider mismatch`);
  const forbidden = /CREATE\s+OR\s+REPLACE\s+FUNCTION|EXECUTE\s+FUNCTION|ROW\s+LEVEL\s+SECURITY|DO\s+\$\$|\bON\s+CONFLICT\b|\bRETURNING\b|::/i;
  if (files.some((file) => forbidden.test(readFileSync(join(dir, file), 'utf8')))) fail(`${provider} migration set contains PostgreSQL-only SQL`);
}
for (const file of ['docs/provider-matrix.md', 'docs/provider-matrix.pt-BR.md']) {
  const text = readFileSync(join(root, file), 'utf8');
  for (const token of ['MySQL', 'MariaDB', '8.0.36', '11.4']) if (!text.includes(token)) fail(`${file} omits ${token}`);
}
const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
for (const token of ['mysql:8.0.36', 'mariadb:11.4', 'OKCMS_MYSQL_ACCEPTANCE_URL', 'OKCMS_MARIADB_ACCEPTANCE_URL']) if (!ci.includes(token)) fail(`CI provider matrix omits ${token}`);
console.log(JSON.stringify({ ok: true, providers: ['postgres', 'mysql', 'mariadb'], migrationCount: 25 }));
