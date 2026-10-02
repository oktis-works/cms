// @oktis-works/worker - Queue Manager

import { Queue, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { JobData, JobHandler } from '../jobs/types.js';

export interface QueueConfig {
  redis: Redis;
  concurrency?: number;
  defaultJobOptions?: {
    attempts?: number;
    backoff?: {
      type: 'fixed' | 'exponential';
      delay: number;
    };
    removeOnComplete?: boolean;
    removeOnFail?: boolean;
  };
}

export class QueueManager {
  private queues = new Map<string, Queue>();
  private workers = new Map<string, Worker>();
  private handlers = new Map<string, JobHandler>();
  private config: QueueConfig;

  constructor(config: QueueConfig) {
    this.config = {
      concurrency: 5,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
      ...config,
    };
  }

  registerHandler(jobType: string, handler: JobHandler): void {
    this.handlers.set(jobType, handler);
  }

  private getQueue(queueName: string): Queue {
    if (!this.queues.has(queueName)) {
      const queue = new Queue(queueName, {
        connection: this.config.redis,
        defaultJobOptions: this.config.defaultJobOptions,
      });
      this.queues.set(queueName, queue);
    }
    return this.queues.get(queueName)!;
  }

  private getWorker(queueName: string): Worker {
    if (!this.workers.has(queueName)) {
      const worker = new Worker(
        queueName,
        async (job: Job) => {
          const handler = this.handlers.get(job.name);
          if (!handler) {
            throw new Error(`No handler registered for job type: ${job.name}`);
          }

          const jobData: JobData = {
            id: job.id?.toString() ?? '',
            type: job.name,
            payload: job.data.payload,
            tenantId: job.data.tenantId,
            userId: job.data.userId,
            createdAt: new Date(job.timestamp),
          };

          return handler(jobData);
        },
        {
          connection: this.config.redis,
          concurrency: this.config.concurrency,
        }
      );

      worker.on('completed', (job) => {
        console.log(`Job ${job.name} completed:`, job.id);
      });

      worker.on('failed', (job, error) => {
        console.error(`Job ${job?.name} failed:`, job?.id, error);
      });

      this.workers.set(queueName, worker);
    }
    return this.workers.get(queueName)!;
  }

  async addJob(
    queueName: string,
    jobType: string,
    data: Record<string, unknown>,
    options?: {
      priority?: number;
      delay?: number;
      jobId?: string;
    }
  ): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.add(jobType, data, {
      ...options,
      jobId: options?.jobId,
    });
  }

  async startWorker(queueName: string): Promise<void> {
    this.getWorker(queueName);
    console.log(`Worker started for queue: ${queueName}`);
  }

  async stopAll(): Promise<void> {
    for (const [name, worker] of this.workers) {
      await worker.close();
      console.log(`Worker stopped: ${name}`);
    }

    for (const [name, queue] of this.queues) {
      await queue.close();
      console.log(`Queue closed: ${name}`);
    }

    this.workers.clear();
    this.queues.clear();
  }

  getStats() {
    return {
      queues: Array.from(this.queues.keys()),
      workers: Array.from(this.workers.keys()),
      handlers: Array.from(this.handlers.keys()),
    };
  }
}
