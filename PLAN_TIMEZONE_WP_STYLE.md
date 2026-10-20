# Plano de Implementação: Sistema de Fuso Horário Estilo OK CMS

## Objetivo
Implementar sistema de fuso horário com mesmo nível de versatilidade e isolamento do OK CMS:
- Dupla configuração: IANA city identifiers (DST automático) + UTC offsets manuais
- Runtime forçado para UTC (isolamento do servidor/SO)
- Armazenamento duplo: local + GMT
- API de abstração: `okDate()`, `okCurrentTime()`, `okGetTimezoneOffset()`

---

## Fase 1: Database Migration & Schema

### 1.1 Migration: Add `published_at_gmt` to content table
- Adicionar coluna `published_at_gmt` TIMESTAMP WITH TIME ZONE
- Índice para queries por data GMT
- Backfill: popular com conversão UTC dos registros existentes

### 1.2 Settings: Nova estrutura
- `timezone_string` (IANA: 'America/Sao_Paulo') - grupo `general`
- `gmt_offset` (manual: -3, +1, etc.) - grupo `general`
- Prioridade: timezone_string > gmt_offset

---

## Fase 2: Core Timezone Service (`packages/core/src/timezone/`)

### 2.1 `timezone-service.ts` - Serviço principal
```typescript
// Bootstrap: força UTC no runtime
export function okForceUtcRuntime(): void

// Configuração do site
export interface SiteTimezoneConfig {
  timezoneString: string | null;  // IANA identifier
  gmtOffset: number | null;       // offset manual em horas
}

// Obter configuração efetiva
export function okGetSiteTimezoneConfig(): SiteTimezoneConfig

// API estilo OK CMS
export function okDate(date: Date | string | number, format?: string, timezone?: string): string
export function okCurrentTime(format?: string): string
export function okGetTimezoneOffset(timezone?: string): number  // segundos
export function okGetTimezoneAbbreviation(): string  // ex: BRT, BRST
export function okConvertToGmt(localDate: Date): Date
export function okConvertFromGmt(gmtDate: Date): Date
export function okIsDstActive(timezone?: string): boolean
```

### 2.2 Integração no bootstrap (`packages/core/src/bootstrap.ts`)
- Chamar `okForceUtcRuntime()` no início

---

## Fase 3: Content Service Integration

### 3.1 `packages/core/src/content/service.ts`
- No `create()` e `update()` com `status: 'PUBLISHED'`:
  - Se `published_at` não fornecido → usar `okCurrentTime()` no timezone do site
  - Calcular `published_at_gmt = okConvertToGmt(published_at)`
  - Salvar ambos

### 3.2 `packages/core/src/content/publisher.ts`
- Mesmo logic para agendamento/publicação futura

---

## Fase 4: Admin UI - Settings → General

### 4.1 `apps/admin/src/components/apps/settings/TimezoneSelect.tsx`
- **Modo Cidade (recomendado)**: Lista searchable de IANA timezones
  - Mostrar DST indicator: "Horário de verão: Ativo/Inativo"
  - Agrupar por continente/região
- **Modo Offset Manual**: Select numérico UTC-12 a UTC+14
  - Aviso: "Não ajusta horário de verão automaticamente"
- Toggle entre modos
- Preview da hora atual no fuso selecionado

### 4.2 `apps/admin/src/components/apps/settings/GeneralSettings.tsx`
- Integrar novo TimezoneSelect
- Salvar tanto `timezone_string` quanto `gmt_offset` (um será null)

---

## Fase 5: Admin Display - Todas as datas usam timezone do site

### 5.1 Listagens de conteúdo (Posts, Pages, etc.)
- `published_at` exibido via `okDate()`

### 5.2 Detalhes de conteúdo
- Datas de criação, atualização, publicação

### 5.3 Logs, auditoria, comentários
- Todas as exibições de data

---

## Fase 6: Frontend (Web App) - Theme SDK

### 6.1 `packages/theme-sdk/src/timezone.ts`
- Expor funções para templates Astro
- `okDate()`, `okCurrentTime()` disponíveis no contexto do tema

### 6.2 `apps/web/src/rendering.ts`
- Passar config de timezone para `renderContentPage`
- Templates usam `okDate(content.published_at, 'F j, Y H:i')`

---

## Fase 7: CLI & Seed

### 7.1 `packages/cli/src/db-prepare.ts` / `seed.ts`
- Seed cria settings `timezone_string` = 'America/Sao_Paulo' (default)

---

## Fase 8: Testes

### 8.1 Unit: `packages/core/src/timezone/service.test.ts`
- DST transitions (março/novembro Brasil, março/outubro EUA/Europa)
- Offsets manuais vs IANA
- Conversão GMT ↔ Local
- Formatação

### 8.2 Integration: `packages/core/src/content/service.test.ts`
- Publish salva ambos os campos
- Scheduled posts respeitam timezone

---

## Fase 9: Validação Completa
- `bun run build`
- `bun run test:run`
- `bun run lint`
- `bun run typecheck`
- Release patch/minor

---

## Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `packages/core/src/timezone/service.ts` | **NOVO** - Serviço principal |
| `packages/core/src/timezone/index.ts` | **NOVO** - Exports |
| `packages/core/src/timezone/service.test.ts` | **NOVO** - Testes |
| `packages/core/src/bootstrap.ts` | Modificar - chamar `okForceUtcRuntime()` |
| `packages/core/src/content/service.ts` | Modificar - salvar `published_at_gmt` |
| `packages/core/src/content/publisher.ts` | Modificar - salvar `published_at_gmt` |
| `packages/database/src/schema/schema.sql` | Migration - add `published_at_gmt` |
| `packages/database/src/migrations/*.ts` | Nova migration |
| `apps/admin/src/components/apps/settings/TimezoneSelect.tsx` | Refatorar - dual mode |
| `apps/admin/src/components/apps/settings/GeneralSettings.tsx` | Modificar - integrar |
| `apps/admin/src/i18n/locales/en.json` + `pt-BR.json` | Novas chaves |
| `packages/theme-sdk/src/timezone.ts` | **NOVO** - API para templates |
| `apps/web/src/rendering.ts` | Modificar - passar timezone config |
| `packages/theme-runtime/src/rendering.ts` | Modificar - contexto templates |

---

## Ordem de Execução
1. Database migration + schema
2. Core timezone service + tests
3. Bootstrap integration
4. Content service integration
5. Admin TimezoneSelect + GeneralSettings
6. Theme SDK + Web rendering
7. Seed default timezone
8. Full test suite + release