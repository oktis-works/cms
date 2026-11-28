import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const fail = (message) => { throw new Error(message); };
const packageJson = JSON.parse(readFileSync(join(root, 'packages/database/package.json'), 'utf8'));
if (!packageJson.dependencies?.postgres) fail('provider driver dependency missing: postgres');
if (!existsSync(join(root, 'packages/database/src/schema/schema.sql'))) fail('provider schema missing: schema.sql');
const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
if (!ci.includes('postgres:16')) fail('CI provider matrix omits postgres:16');
console.log(JSON.stringify({ ok: true, providers: ['postgres'], migrationCount: 0 }));
