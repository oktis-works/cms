// @oktis-works/core - Event Durability Tests (RULE-event-idempotency, REQ-event-bus-004/005)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from './bus.js';
import { EventStore } from './store.js';

const event = () => ({
  id: 'e1-uuid',
  type: 'content.published',
  aggregateType: 'content',
  aggregateId: 'c1',
  payload: { title: 'hi' },
  processed: false,
  createdAt: new Date(),
});

vi.mock('@oktis-works/database', () => ({
  getConnection: vi.fn(() => ({
    query: Object.assign(async (strings: TemplateStringsArray, ..._values: unknown[]) => {
      const text = strings.join('?');
      if (text.includes('SELECT processed')) return [{ processed: store.processed }];
      return [];
    }, {
      unsafe: vi.fn(),
    }),
  })),
}));

const store = { processed: false, persisted: [] as string[], dlq: [] as unknown[] };

beforeEach(() => {
  store.processed = false;
  store.persisted = [];
  store.dlq = [];

  // intercepta o EventStore real via prototype (client mockado acima)
  vi.spyOn(EventStore.prototype, 'isProcessed').mockImplementation(async () => store.processed);
  vi.spyOn(EventStore.prototype, 'persist').mockImplementation(async (e) => {
    store.persisted.push(e.id);
  });
  vi.spyOn(EventStore.prototype, 'markProcessed').mockImplementation(async () => {
    store.processed = true;
  });
  vi.spyOn(EventStore.prototype, 'toDeadLetter').mockImplementation(async (e) => {
    store.dlq.push(e.id);
  });
});

describe('EventBus com EventStore (durabilidade)', () => {
  it('evento já processado não reprocessa handlers (idempotência)', async () => {
    store.processed = true;
    const handler = vi.fn();
    const bus = new EventBus({ maxRetries: 0, retryDelay: 0 }, new EventStore());
    bus.on('content.published', handler);

    await bus.emit(event());

    expect(handler).not.toHaveBeenCalled();
  });

  it('marca processed após sucesso de todos os handlers', async () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    const bus = new EventBus({ maxRetries: 0, retryDelay: 0 }, new EventStore());
    bus.on('content.published', h1);
    bus.on('content.published', h2);

    await bus.emit(event());

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
    expect(store.processed).toBe(true);
  });

  it('não marca processed quando um handler falha após retries', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('boom'));
    const bus = new EventBus(
      { maxRetries: 1, retryDelay: 1, deadLetterQueueEnabled: false },
      new EventStore()
    );
    bus.on('content.published', failing);

    await expect(bus.emit(event())).rejects.toThrow('boom');

    expect(failing).toHaveBeenCalledTimes(2); // tentativa + 1 retry
    expect(store.processed).toBe(false);
  });

  it('DLQ durável recebe evento após esgotar retries', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('dead'));
    const bus = new EventBus({ maxRetries: 2, retryDelay: 1 }, new EventStore());
    bus.on('content.published', failing);

    await bus.emit(event()); // DLQ não propaga erro

    expect(failing).toHaveBeenCalledTimes(3); // 1 + maxRetries
    expect(store.dlq).toEqual(['e1-uuid']);
    expect(bus.getDeadLetterQueue()).toHaveLength(1);
  });

  it('sem store, comportamento in-memory original é preservado', async () => {
    const handler = vi.fn();
    const bus = new EventBus({ maxRetries: 0, retryDelay: 0 });
    bus.on('content.published', handler);

    await bus.emit(event());
    await bus.emit(event()); // sem store não há dedupe

    expect(handler).toHaveBeenCalledTimes(2);
  });
});
