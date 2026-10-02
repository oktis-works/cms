// @oktis-works/core - Event Bus

import type { Event } from '@oktis-works/types';
import type { EventStore } from './store.js';

export type EventHandler = (event: Event) => Promise<void>;

export interface EventBusConfig {
  maxRetries: number;
  retryDelay: number;
  deadLetterQueueEnabled: boolean;
}

const defaultConfig: EventBusConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  deadLetterQueueEnabled: true,
};

export class EventBus {
  private handlers = new Map<string, EventHandler[]>();
  private deadLetterQueue: Event[] = [];
  private config: EventBusConfig;
  private store?: EventStore;

  constructor(config: Partial<EventBusConfig> = {}, store?: EventStore) {
    this.config = { ...defaultConfig, ...config };
    this.store = store;
  }

  on(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType) ?? [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);
  }

  off(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType) ?? [];
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  async emit(event: Event): Promise<void> {
    // RULE-event-idempotency: evento já processado não é reprocessado
    if (this.store) {
      if (await this.store.isProcessed(event.id)) return;
      await this.store.persist(event);
    }

    const handlers = this.handlers.get(event.type) ?? [];
    const allHandlers = [...handlers, ...this.handlers.get('*') ?? []];

    const results = await Promise.allSettled(
      allHandlers.map(handler => this.executeWithRetry(handler, event, 0))
    );

    const firstRejection = results.find(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    );

    if (!firstRejection) {
      if (this.store && allHandlers.length > 0) await this.store.markProcessed(event.id);
      return;
    }
    throw firstRejection.reason;
  }

  async emitSync(event: Event): Promise<void> {
    await this.emit(event);
  }

  private async executeWithRetry(
    handler: EventHandler,
    event: Event,
    attempt: number
  ): Promise<void> {
    try {
      await handler(event);
    } catch (error) {
      if (attempt < this.config.maxRetries) {
        const delay = this.config.retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        await this.executeWithRetry(handler, event, attempt + 1);
      } else if (this.config.deadLetterQueueEnabled) {
        this.deadLetterQueue.push(event);
        if (this.store) {
          await this.store.toDeadLetter(
            event,
            error instanceof Error ? error.message : String(error),
            this.config.maxRetries
          );
        }
        console.error(`Event ${event.type} sent to dead letter queue after ${this.config.maxRetries} attempts`);
      } else {
        throw error;
      }
    }
  }

  getDeadLetterQueue(): Event[] {
    return [...this.deadLetterQueue];
  }

  clearDeadLetterQueue(): void {
    this.deadLetterQueue = [];
  }
}

let _eventBus: EventBus | null = null;

export function getEventBus(): EventBus {
  if (!_eventBus) {
    _eventBus = new EventBus();
  }
  return _eventBus;
}

export function createEventBus(config?: Partial<EventBusConfig>): EventBus {
  _eventBus = new EventBus(config);
  return _eventBus;
}
