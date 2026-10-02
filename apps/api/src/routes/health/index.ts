// @oktis-works/api - Health Check Route

import { Hono } from 'hono';
import type { Context } from 'hono';
import { healthCheck } from '@oktis-works/database';

const healthRouter = new Hono();

// GET /health
healthRouter.get('/', async (c: Context) => {
  const dbHealthy = await healthCheck();

  const status = dbHealthy ? 'healthy' : 'degraded';
  const statusCode = dbHealthy ? 200 : 503;

  return c.json({
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: dbHealthy ? 'ok' : 'error',
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
