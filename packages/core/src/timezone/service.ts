// @oktis-works/core - Timezone Service (OK CMS versatility)
// Isolamento completo do servidor/SO: força UTC no runtime, usa IANA database para DST

import { getConnection } from '@oktis-works/database';

/**
 * Configuração de fuso horário do site.
 * timezoneString: identificador IANA (ex: 'America/Sao_Paulo') - tem DST automático
 * gmtOffset: offset manual em horas (ex: -3) - estático, sem DST
 */
export interface SiteTimezoneConfig {
  timezoneString: string | null;
  gmtOffset: number | null;
}

let siteTimezoneCache: SiteTimezoneConfig | null = null;

// IANA timezone database (subset das mais comuns)
// Em produção, usar Intl.DateTimeFormat().resolvedOptions().timeZone ou biblioteca completa
const _COMMON_TIMEZONES = [
  'UTC',
  'America/Sao_Paulo',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'America/Denver',
  'America/Toronto',
  'America/Vancouver',
  'America/Mexico_City',
  'America/Argentina/Buenos_Aires',
  'America/Lima',
  'America/Bogota',
  'America/Caracas',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'Europe/Madrid',
  'Europe/Amsterdam',
  'Europe/Stockholm',
  'Europe/Oslo',
  'Europe/Copenhagen',
  'Europe/Helsinki',
  'Europe/Warsaw',
  'Europe/Moscow',
  'Europe/Istanbul',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Asia/Seoul',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Manila',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Perth',
  'Australia/Brisbane',
  'Pacific/Auckland',
  'Pacific/Fiji',
];

/**
 * Força o runtime PHP/Node a usar UTC.
 * Equivalente ao OK CMS: date_default_timezone_set('UTC')
 * Deve ser chamado no bootstrap ANTES de qualquer operação de data.
 */
export function okForceUtcRuntime(): void {
  // Node.js: define TZ global
  process.env.TZ = 'UTC';
  // Para compatibilidade com bibliotecas que leem process.env.TZ
  if (typeof Intl !== 'undefined') {
    // Intl usa o TZ do ambiente
  }
}

/**
 * Obtém configuração efetiva do fuso horário do site (síncrono, com fallback).
 * Prioridade: timezone_string (IANA) > gmt_offset (manual)
 * Para versão assíncrona que carrega do banco, use okLoadSiteTimezoneConfig().
 */
export function okGetSiteTimezoneConfig(): SiteTimezoneConfig {
  if (siteTimezoneCache) return siteTimezoneCache;

  // Fallback padrão (Brasil) - o cache será atualizado quando okLoadSiteTimezoneConfig() for chamado
  siteTimezoneCache = { timezoneString: 'America/Sao_Paulo', gmtOffset: -3 };
  return siteTimezoneCache;
}

/**
 * Carrega configuração do banco de dados (assíncrono).
 * Deve ser chamado quando o tenant context estiver disponível.
 */
export async function okLoadSiteTimezoneConfig(): Promise<SiteTimezoneConfig> {
  try {
    const sql = getConnection();
    const rows = await sql.unsafe(
      `SELECT key, value FROM settings
       WHERE key IN ('timezone_string', 'gmt_offset')
         AND (tenant_id IS NULL OR tenant_id = current_setting('app.current_tenant_id', true)::uuid)
       ORDER BY tenant_id NULLS FIRST`
    );

    let timezoneString: string | null = null;
    let gmtOffset: number | null = null;

    for (const row of rows as Array<Record<string, unknown>>) {
      const key = row['key'] as string | undefined;
      const val = row['value'];
      if (key === 'timezone_string') {
        timezoneString = typeof val === 'string' ? val : null;
      } else if (key === 'gmt_offset') {
        gmtOffset = typeof val === 'number' ? val : typeof val === 'string' ? parseFloat(val) : null;
      }
    }

    siteTimezoneCache = { timezoneString, gmtOffset };
    return siteTimezoneCache;
  } catch {
    // Fallback silencioso
    siteTimezoneCache = { timezoneString: 'America/Sao_Paulo', gmtOffset: -3 };
    return siteTimezoneCache;
  }
}

/**
 * Limpa cache (útil após update de settings)
 */
export function okClearTimezoneCache(): void {
  siteTimezoneCache = null;
}

/**
 * Retorna offset atual em segundos para o timezone configurado.
 * Usa IANA database (Intl) para calcular DST automaticamente.
 */
export function okGetTimezoneOffset(timezone?: string): number {
  const tz = timezone ?? okGetSiteTimezoneConfig().timezoneString ?? 'UTC';

  if (tz === 'UTC') return 0;

  // Se for offset manual (formato UTC+X ou UTC-X)
  const manualMatch = tz.match(/^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (manualMatch) {
    const sign = manualMatch[1] === '+' ? 1 : -1;
    const hours = parseInt(manualMatch[2] ?? '0', 10);
    const minutes = manualMatch[3] ? parseInt(manualMatch[3], 10) : 0;
    return sign * (hours * 3600 + minutes * 60);
  }

  // IANA timezone: usar Intl para calcular offset atual (inclui DST)
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(now);
    const offsetStr = parts.find(p => p.type === 'timeZoneName')?.value ?? '';
    // offsetStr formato: "GMT-3" ou "GMT-03:00"
    const match = offsetStr.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (match) {
      const sign = match[1] === '+' ? 1 : -1;
      const hours = parseInt(match[2] ?? '0', 10);
      const minutes = match[3] ? parseInt(match[3], 10) : 0;
      return sign * (hours * 3600 + minutes * 60);
    }
  } catch {
    // Fallback
  }

  // Fallback: tentar parsear offset do gmt_offset setting
  const config = okGetSiteTimezoneConfig();
  if (config.gmtOffset !== null) {
    return config.gmtOffset * 3600;
  }

  return 0;
}

/**
 * Verifica se DST está ativo para o timezone dado.
 */
export function okIsDstActive(timezone?: string): boolean {
  const tz = timezone ?? okGetSiteTimezoneConfig().timezoneString ?? 'UTC';
  if (tz === 'UTC') return false;

  // Offsets manuais nunca têm DST
  if (/^UTC[+-]/.test(tz)) return false;

  try {
    const january = new Date(Date.UTC(new Date().getFullYear(), 0, 1));
    const july = new Date(Date.UTC(new Date().getFullYear(), 6, 1));

    const janOffset = getTimezoneOffsetForDate(january, tz);
    const julOffset = getTimezoneOffsetForDate(july, tz);
    const nowOffset = getTimezoneOffsetForDate(new Date(), tz);

    // DST ativo se offset atual difere do offset padrão (janeiro no hemisfério norte, julho no sul)
    return nowOffset !== Math.min(janOffset, julOffset);
  } catch {
    return false;
  }
}

function getTimezoneOffsetForDate(date: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      hour: 'numeric',
      minute: 'numeric',
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(date);
    const offsetStr = parts.find(p => p.type === 'timeZoneName')?.value ?? '';
    const match = offsetStr.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (match) {
      const sign = match[1] === '+' ? 1 : -1;
      const hours = parseInt(match[2] ?? '0', 10);
      const minutes = match[3] ? parseInt(match[3], 10) : 0;
      return sign * (hours * 3600 + minutes * 60);
    }
  } catch {
    // ignore
  }
  return 0;
}

/**
 * Converte data local para GMT/UTC.
 */
export function okConvertToGmt(localDate: Date): Date {
  const offset = okGetTimezoneOffset();
  return new Date(localDate.getTime() - offset * 1000);
}

/**
 * Converte data GMT/UTC para local.
 */
export function okConvertFromGmt(gmtDate: Date): Date {
  const offset = okGetTimezoneOffset();
  return new Date(gmtDate.getTime() + offset * 1000);
}

/**
 * Retorna abreviação do timezone (ex: BRT, BRST, EST, EDT).
 */
export function okGetTimezoneAbbreviation(): string {
  const config = okGetSiteTimezoneConfig();
  const tz = config.timezoneString ?? 'UTC';

  if (tz === 'UTC') return 'UTC';
  if (/^UTC[+-]/.test(tz)) return tz;

  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
      hour12: false,
      hour: 'numeric',
    });
    const parts = formatter.formatToParts(now);
    const tzName = parts.find(p => p.type === 'timeZoneName')?.value ?? '';
    // tzName pode ser "BRT" ou "GMT-3"
    return tzName.replace('GMT', 'UTC');
  } catch {
    return tz;
  }
}

/**
 * Formata data no timezone do site.
 * Equivalente ao OK CMS okDate().
 */
export function okDate(
  date: Date | string | number,
  format: string = 'Y-m-d H:i:s',
  timezone?: string
): string {
  const tz = timezone ?? okGetSiteTimezoneConfig().timezoneString ?? 'UTC';
  const d = date instanceof Date ? date : new Date(date);

  if (isNaN(d.getTime())) return 'Invalid Date';

  // Converter para o timezone alvo
  const offset = timezone ? getTimezoneOffsetForTimezone(timezone) : okGetTimezoneOffset(timezone);
  const localTime = new Date(d.getTime() + offset * 1000);

  return formatDate(localTime, format, tz);
}

function getTimezoneOffsetForTimezone(timezone: string): number {
  if (timezone === 'UTC') return 0;
  const manualMatch = timezone.match(/^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (manualMatch) {
    const sign = manualMatch[1] === '+' ? 1 : -1;
    const hours = parseInt(manualMatch[2] ?? '0', 10);
    const minutes = manualMatch[3] ? parseInt(manualMatch[3], 10) : 0;
    return sign * (hours * 3600 + minutes * 60);
  }
  return 0; // IANA handled by Intl in formatDate
}

function formatDate(date: Date, format: string, timezone: string): string {
  // Simple format replacement (subset of PHP date format)
  const pad = (n: number) => n.toString().padStart(2, '0');

  // Use Intl for proper timezone formatting
  try {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone === 'UTC' || /^UTC[+-]/.test(timezone) ? 'UTC' : timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    };
    const formatted = new Intl.DateTimeFormat('en-CA', options).format(date);
    // en-CA gives YYYY-MM-DD, HH:MM:SS
    if (format === 'Y-m-d H:i:s') return formatted.replace(',', '');
    // For other formats, fallback to manual
  } catch {
    // fallback
  }

  // Manual fallback
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());

  return format
    .replace('Y', year.toString())
    .replace('m', month)
    .replace('d', day)
    .replace('H', hours)
    .replace('i', minutes)
    .replace('s', seconds);
}

/**
 * Retorna hora atual no timezone do site.
 * Equivalente ao OK CMS okCurrentTime().
 */
export function okCurrentTime(format: string = 'Y-m-d H:i:s'): string {
  return okDate(new Date(), format);
}

/**
 * Lista de timezones IANA comuns para o select do admin.
 */
export function okGetCommonTimezones(): Array<{ value: string; label: string; region: string }> {
  const regions: Record<string, string[]> = {
    'América': [
      'America/Sao_Paulo',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Toronto',
      'America/Vancouver',
      'America/Mexico_City',
      'America/Argentina/Buenos_Aires',
      'America/Lima',
      'America/Bogota',
    ],
    'Europa': [
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Europe/Rome',
      'Europe/Madrid',
      'Europe/Amsterdam',
      'Europe/Stockholm',
      'Europe/Warsaw',
      'Europe/Moscow',
    ],
    'Ásia': [
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Asia/Hong_Kong',
      'Asia/Singapore',
      'Asia/Dubai',
      'Asia/Kolkata',
      'Asia/Bangkok',
    ],
    'Oceania': [
      'Australia/Sydney',
      'Australia/Melbourne',
      'Australia/Perth',
      'Pacific/Auckland',
    ],
    'UTC': ['UTC'],
  };

  const result: Array<{ value: string; label: string; region: string }> = [];

  for (const [region, zones] of Object.entries(regions)) {
    for (const zone of zones) {
      try {
        const formatter = new Intl.DateTimeFormat('pt-BR', {
          timeZone: zone,
          timeZoneName: 'shortOffset',
          hour12: false,
          hour: 'numeric',
        });
        const parts = formatter.formatToParts(new Date());
        const offsetStr = parts.find(p => p.type === 'timeZoneName')?.value ?? '';
        const isDst = okIsDstActive(zone);
        const dstLabel = isDst ? ' (Horário de verão)' : '';
        result.push({
          value: zone,
          label: `${zone} — ${offsetStr}${dstLabel}`,
          region,
        });
      } catch {
        result.push({ value: zone, label: zone, region });
      }
    }
  }

  return result;
}

/**
 * Offsets manuais UTC-12 a UTC+14
 */
export function okGetManualOffsets(): Array<{ value: string; label: string }> {
  const offsets: Array<{ value: string; label: string }> = [];
  for (let h = -12; h <= 14; h++) {
    const sign = h >= 0 ? '+' : '';
    const value = `UTC${sign}${h}`;
    offsets.push({ value, label: value });
  }
  return offsets;
}