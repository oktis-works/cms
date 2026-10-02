// @oktis-works/core - Structured Logger (REQ-observability)

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEYS = /^(password|token|secret|authorization|cookie|api[_-]?key)$/i;

const REDACTED = '[REDACTED]';

function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.test(key)) {
      out[key] = REDACTED;
    } else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Error)) {
      out[key] = redact(value as Record<string, unknown>);
    } else if (value instanceof Error) {
      out[key] = { name: value.name, message: value.message };
    } else {
      out[key] = value;
    }
  }
  return out;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export function createLogger(
  bindings: Record<string, unknown> = {},
  options: { minLevel?: LogLevel; sink?: (line: string) => void } = {}
): Logger {
  const minLevel = options.minLevel ?? (process.env['LOG_LEVEL'] as LogLevel | undefined) ?? 'info';
  const sink = options.sink ?? ((line: string) => process.stdout.write(line + '\n'));

  function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minLevel]) return;
    const entry = {
      time: new Date().toISOString(),
      level,
      msg: message,
      ...redact({ ...bindings, ...(meta ?? {}) }),
    };
    sink(JSON.stringify(entry));
  }

  return {
    debug: (msg, meta) => emit('debug', msg, meta),
    info: (msg, meta) => emit('info', msg, meta),
    warn: (msg, meta) => emit('warn', msg, meta),
    error: (msg, meta) => emit('error', msg, meta),
    child: (extra) => createLogger({ ...bindings, ...extra }, { minLevel, sink }),
  };
}
