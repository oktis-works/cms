// @oktis-works/core - Application Lifecycle

import { createConnection, closeConnection } from '@oktis-works/database';
import type { Config } from '@oktis-works/config';
import { createCache, getCache } from '../cache/index.js';
import { createEventBus, getEventBus } from '../events/bus.js';
import { registerWebhookDispatch, registerCacheInvalidation } from '../events/webhooks.js';
import { queueProducer } from '../queue/producer.js';
import { clearCurrentContext } from '../tenant/context.js';

export interface LifecycleHook {
  name: string;
  handler: () => Promise<void>;
}

export class ApplicationLifecycle {
  private hooks = {
    beforeStart: [] as LifecycleHook[],
    afterStart: [] as LifecycleHook[],
    beforeStop: [] as LifecycleHook[],
    afterStop: [] as LifecycleHook[],
  };
  private started = false;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  on(event: 'beforeStart' | 'afterStart' | 'beforeStop' | 'afterStop', hook: LifecycleHook): void {
    this.hooks[event].push(hook);
  }

  async start(): Promise<void> {
    if (this.started) {
      throw new Error('Application already started');
    }

    await this.runHooks('beforeStart');

    // Initialize database (core-bootstrap-002: retry com backoff em falhas transitivas)
    const retries = this.config.database.retries ?? 3;
    let lastError: unknown;
    for (let attempt = 1; attempt <= Number(retries); attempt++) {
      try {
        await createConnection(this.config.database);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 250 * attempt));
        }
      }
    }
    if (lastError) {
      throw lastError;
    }

    // Initialize cache
    createCache(this.config.cache);

    // Initialize event bus
    createEventBus();

    // Fan-out assíncrono: webhooks assinados e invalidação cross-process de cache
    // (producer é lazy — conexão Redis abre no primeiro enqueue; degrada sem fila)
    registerWebhookDispatch(getEventBus());
    registerCacheInvalidation(getEventBus());

    this.started = true;
    await this.runHooks('afterStart');
  }

  async stop(): Promise<void> {
    if (!this.started) return;

    await this.runHooks('beforeStop');

    const cache = getCache();
    await cache.cleanup();

    const eventBus = getEventBus();
    eventBus.clearDeadLetterQueue();

    await queueProducer.close();

    await clearCurrentContext();
    await closeConnection();

    this.started = false;
    await this.runHooks('afterStop');
  }

  isStarted(): boolean {
    return this.started;
  }

  private async runHooks(event: 'beforeStart' | 'afterStart' | 'beforeStop' | 'afterStop'): Promise<void> {
    for (const hook of this.hooks[event]) {
      try {
        await hook.handler();
      } catch (error) {
        console.error(`Lifecycle hook ${hook.name} failed:`, error);
      }
    }
  }
}
