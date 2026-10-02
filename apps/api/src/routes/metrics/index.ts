// @oktis-works/api - Metrics endpoint (REQ-observability-003)

import { Hono } from 'hono';
import { metrics } from '@oktis-works/core';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const router = new Hono();

router.use('*', authMiddleware);

const prometheusEscape = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const labelString = (labels: Record<string, string>): string =>
  Object.entries(labels)
    .map(([k, v]) => `${k}="${prometheusEscape(v)}"`)
    .join(',');

const toPrometheus = (snapshot: ReturnType<typeof metrics.snapshot>): string => {
  const lines: string[] = [];
  for (const counter of snapshot.counters) {
    const labels = labelString(counter.labels);
    lines.push(`# TYPE ${counter.name} counter`, `${counter.name}{${labels}} ${counter.value}`);
  }
  for (const gauge of snapshot.gauges) {
    const labels = labelString(gauge.labels);
    lines.push(`# TYPE ${gauge.name} gauge`, `${gauge.name}{${labels}} ${gauge.value}`);
  }
  return lines.join('\n') + '\n';
};

router.get('/', requirePermission('read', 'system'), async (c) => {
  const snapshot = metrics.snapshot();

  if (c.req.query('format') === 'json') {
    return c.json(snapshot);
  }

  return c.text(toPrometheus(snapshot), 200, { 'Content-Type': 'text/plain; version=0.0.4' });
});

export default router;
