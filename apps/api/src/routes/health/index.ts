// @oktis-works/api - Health Check Route
//
// Item 14: plugin health checks (api.health.register, permission
// health:register) run aggregated here with a 2s budget each — failure,
// throw or timeout is reported as 'error' and never breaks the endpoint.

import { Hono } from 'hono';
import type { Context } from 'hono';
import { healthCheck } from '@oktis-works/database';
import { getPluginHealthChecks } from '@oktis-works/core';

const healthRouter = new Hono();

const PLUGIN_CHECK_TIMEOUT_MS = 2000;

interface PluginCheckOutcome {
  status: 'ok' | 'error';
  details?: Record<string, unknown>;
  error?: string;
}

/** Runs one plugin check with a hard timeout; never throws. */
async function runPluginCheck(
  pluginName: string,
  name: string,
  check: () => unknown
): Promise<[string, PluginCheckOutcome]> {
  const key = `${pluginName}:${name}`;
  const timeout = new Promise<[string, PluginCheckOutcome]>((resolve) =>
    setTimeout(() => resolve([key, { status: 'error', error: `timeout after ${PLUGIN_CHECK_TIMEOUT_MS}ms` }]), PLUGIN_CHECK_TIMEOUT_MS)
  );
  const run = (async (): Promise<[string, PluginCheckOutcome]> => {
    try {
      const result = (await check()) as { ok?: boolean; details?: Record<string, unknown> } | undefined;
      return [key, { status: result?.ok ? 'ok' : 'error', details: result?.details }];
    } catch (error) {
      return [key, { status: 'error', error: error instanceof Error ? error.message : String(error) }];
    }
  })();
  (timeout as unknown as { unref?: () => void }).unref?.();
  return Promise.race([run, timeout]);
}

/** Aggregates every registered plugin check (platform scope). */
async function runAllPluginChecks(): Promise<Record<string, PluginCheckOutcome>> {
  const outcomes: Record<string, PluginCheckOutcome> = {};
  try {
    const entries = await getPluginHealthChecks(null);
    const results = await Promise.all(
      entries.flatMap((entry) =>
        entry.checks.map((registered) => runPluginCheck(entry.pluginName, registered.name, registered.check))
      )
    );
    for (const [key, outcome] of results) {
      outcomes[key] = outcome;
    }
  } catch {
    // runtime unavailable — health stays database-only
  }
  return outcomes;
}

// GET /health
healthRouter.get('/', async (c: Context) => {
  const dbHealthy = await healthCheck();
  const pluginChecks = await runAllPluginChecks();

  const pluginsHealthy = Object.values(pluginChecks).every((outcome) => outcome.status === 'ok');
  const status = dbHealthy && pluginsHealthy ? 'healthy' : 'degraded';
  const statusCode = dbHealthy && pluginsHealthy ? 200 : 503;

  return c.json({
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: dbHealthy ? 'ok' : 'error',
      plugins: pluginChecks,
    },
  }, statusCode);
});

// GET /health/ready
healthRouter.get('/ready', async (c: Context) => {
  const dbHealthy = await healthCheck();

  if (!dbHealthy) {
    return c.json({ ready: false }, 503);
  }

  return c.json({ ready: true });
});

// GET /health/live
healthRouter.get('/live', async (c: Context) => {
  return c.json({ alive: true });
});

export default healthRouter;
