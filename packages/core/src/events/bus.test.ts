import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('EventBus', () => {
  let EventBus: any;
  let eventBus: any;

  beforeEach(async () => {
    const mod = await import('./bus.js');
    EventBus = mod.EventBus;
    eventBus = new EventBus();
  });

  it('should emit and receive events', async () => {
    const handler = vi.fn();
    eventBus.on('test.event', handler);

    await eventBus.emit({
      id: 'evt-1',
      type: 'test.event',
      aggregateType: 'test',
      aggregateId: 'agg-1',
      payload: { data: 'hello' },
      processed: false,
      createdAt: new Date(),
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'test.event' })
    );
  });

  it('should support multiple listeners', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    eventBus.on('test.event', handler1);
    eventBus.on('test.event', handler2);

    await eventBus.emit({
      id: 'evt-1',
      type: 'test.event',
      aggregateType: 'test',
      aggregateId: 'agg-1',
      payload: {},
      processed: false,
      createdAt: new Date(),
    });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('should handle emit errors gracefully', async () => {
    // Retry rápido para o teste não esperar o backoff de produção (1s+2s+4s)
    const fastBus = new EventBus({ maxRetries: 2, retryDelay: 10 });
    const badHandler = vi.fn().mockRejectedValue(new Error('Handler failed'));
    fastBus.on('test.event', badHandler);

    const event = {
      id: 'evt-1',
      type: 'test.event',
      aggregateType: 'test',
      aggregateId: 'agg-1',
      payload: {},
      processed: false,
      createdAt: new Date(),
    };

    // Should not throw
    await expect(fastBus.emit(event)).resolves.not.toThrow();

    // Handler tentou maxRetries+1 vezes e evento foi para a DLQ
    expect(badHandler).toHaveBeenCalledTimes(3);
    expect(fastBus.getDeadLetterQueue()).toHaveLength(1);
    expect(fastBus.getDeadLetterQueue()[0]?.id).toBe('evt-1');
  });
});
