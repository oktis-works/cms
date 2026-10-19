// @oktis-works/cms - sync das migrations embutidas → ./migrations do projeto
//
// O contrato destrutivo é o coração aqui: syncNunca apaga nem sobrescreve
// arquivo local diferente — só copia o que falta e relata conflito.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncMigrations } from './migrations-sync.js';
let project;
let source;
beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), 'okcms-sync-project-'));
    source = mkdtempSync(join(tmpdir(), 'okcms-sync-source-'));
});
afterEach(() => {
    rmSync(project, { recursive: true, force: true });
    rmSync(source, { recursive: true, force: true });
});
const quiet = () => { };
describe('syncMigrations', () => {
    it('copia as migrations que faltam no projeto', () => {
        writeFileSync(join(source, 'V001__a.sql'), '-- a');
        writeFileSync(join(source, 'V002__b.sql'), '-- b');
        const result = syncMigrations(project, { sourceDir: source, log: quiet });
        expect(result.bundled).toBe(true);
        expect(result.added).toEqual(['V001__a.sql', 'V002__b.sql']);
        expect(result.conflicts).toEqual([]);
        expect(readFileSync(join(project, 'migrations', 'V001__a.sql'), 'utf-8')).toBe('-- a');
        expect(readFileSync(join(project, 'migrations', 'V002__b.sql'), 'utf-8')).toBe('-- b');
    });
    it('pula idênticas e mantém o arquivo local diante de conflito', () => {
        mkdirSync(join(project, 'migrations'), { recursive: true });
        writeFileSync(join(source, 'V001__a.sql'), '-- a');
        writeFileSync(join(source, 'V002__b.sql'), '-- novo');
        writeFileSync(join(project, 'migrations', 'V001__a.sql'), '-- a');
        writeFileSync(join(project, 'migrations', 'V002__b.sql'), '-- editado local');
        const result = syncMigrations(project, { sourceDir: source, log: quiet });
        expect(result.added).toEqual([]);
        expect(result.unchanged).toEqual(['V001__a.sql']);
        expect(result.conflicts).toEqual(['V002__b.sql']);
        // o local NÃO foi sobrescrito
        expect(readFileSync(join(project, 'migrations', 'V002__b.sql'), 'utf-8')).toBe('-- editado local');
    });
    it('segunda chamada é idempotente (tudo unchanged)', () => {
        writeFileSync(join(source, 'V001__a.sql'), '-- a');
        syncMigrations(project, { sourceDir: source, log: quiet });
        const second = syncMigrations(project, { sourceDir: source, log: quiet });
        expect(second.added).toEqual([]);
        expect(second.unchanged).toEqual(['V001__a.sql']);
        expect(second.conflicts).toEqual([]);
    });
    it('pacote sem migrations embutidas reporta bundled:false e não copia nada', () => {
        const result = syncMigrations(project, {
            sourceDir: join(project, 'nao-existe'),
            log: quiet,
        });
        expect(result.bundled).toBe(false);
        expect(result.added).toEqual([]);
        expect(existsSync(join(project, 'migrations'))).toBe(false);
    });
    it('ignora arquivos que não são .sql', () => {
        writeFileSync(join(source, 'README.md'), '# docs');
        const result = syncMigrations(project, { sourceDir: source, log: quiet });
        expect(result.added).toEqual([]);
        expect(existsSync(join(project, 'migrations', 'README.md'))).toBe(false);
    });
});
//# sourceMappingURL=migrations-sync.test.js.map