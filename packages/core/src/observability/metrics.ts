// @oktis-works/core - Metrics Registry (REQ-observability-003)

export type MetricLabels = Record<string, string>;

export interface CounterSample {
  name: string;
  labels: MetricLabels;
  value: number;
}

export interface GaugeSample {
  name: string;
  labels: MetricLabels;
  value: number;
  updatedAt: string;
}

const keyOf = (name: string, labels?: MetricLabels): string =>
  name + '|' + JSON.stringify(labels ?? {});

/**
 * Registry in-memory de counters e gauges.
 * Suficiente para progresso de deployments visível via snapshot;
 * exportação para Prometheus/OTel fica no endpoint de metrics.
 */
export class MetricsRegistry {
  private counters = new Map<string, CounterSample>();
  private gauges = new Map<string, GaugeSample>();

  inc(name: string, labels?: MetricLabels, delta = 1): void {
    const key = keyOf(name, labels);
    const current = this.counters.get(key);
    if (current) {
      current.value += delta;
    } else {
      this.counters.set(key, { name, labels: labels ?? {}, value: delta });
    }
  }

  gauge(name: string, value: number, labels?: MetricLabels): void {
    this.gauges.set(keyOf(name, labels), {
      name,
      labels: labels ?? {},
      value,
      updatedAt: new Date().toISOString(),
    });
  }

  getCounter(name: string, labels?: MetricLabels): number | undefined {
    return this.counters.get(keyOf(name, labels))?.value;
  }

  getGauge(name: string, labels?: MetricLabels): GaugeSample | undefined {
    return this.gauges.get(keyOf(name, labels));
  }

  snapshot(): { counters: CounterSample[]; gauges: GaugeSample[] } {
    return {
      counters: [...this.counters.values()],
      gauges: [...this.gauges.values()],
    };
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
  }
}

export const metrics = new MetricsRegistry();

/** REQ-observability-003: progresso de deployment visível em metrics. */
export function trackDeploymentProgress(
  deploymentId: string,
  stage: 'deploying' | 'health-check' | 'active' | 'failed'
): void {
  const progress = { deploying: 10, 'health-check': 50, active: 100, failed: 50 }[stage];
  metrics.gauge('deployment.progress', progress, { deploymentId });
  if (stage === 'active') metrics.inc('deployments.total', { status: 'active' });
  if (stage === 'failed') metrics.inc('deployments.total', { status: 'failed' });
}
