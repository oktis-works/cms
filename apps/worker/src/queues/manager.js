// @oktis-works/worker - Queue Manager
import { Queue, Worker } from 'bullmq';
export class QueueManager {
    queues = new Map();
    workers = new Map();
    handlers = new Map();
    config;
    constructor(config) {
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
    registerHandler(jobType, handler) {
        this.handlers.set(jobType, handler);
    }
    getQueue(queueName) {
        if (!this.queues.has(queueName)) {
            const queue = new Queue(queueName, {
                connection: this.config.redis,
                defaultJobOptions: this.config.defaultJobOptions,
            });
            this.queues.set(queueName, queue);
        }
        return this.queues.get(queueName);
    }
    getWorker(queueName) {
        if (!this.workers.has(queueName)) {
            const worker = new Worker(queueName, async (job) => {
                const handler = this.handlers.get(job.name);
                if (!handler) {
                    throw new Error(`No handler registered for job type: ${job.name}`);
                }
                const jobData = {
                    id: job.id?.toString() ?? '',
                    type: job.name,
                    payload: job.data.payload,
                    tenantId: job.data.tenantId,
                    userId: job.data.userId,
                    createdAt: new Date(job.timestamp),
                };
                return handler(jobData);
            }, {
                connection: this.config.redis,
                concurrency: this.config.concurrency,
            });
            worker.on('completed', (job) => {
                console.log(`Job ${job.name} completed:`, job.id);
            });
            worker.on('failed', (job, error) => {
                console.error(`Job ${job?.name} failed:`, job?.id, error);
            });
            this.workers.set(queueName, worker);
        }
        return this.workers.get(queueName);
    }
    async addJob(queueName, jobType, data, options) {
        const queue = this.getQueue(queueName);
        await queue.add(jobType, data, {
            ...options,
            jobId: options?.jobId,
        });
    }
    async startWorker(queueName) {
        this.getWorker(queueName);
        console.log(`Worker started for queue: ${queueName}`);
    }
    async stopAll() {
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
//# sourceMappingURL=manager.js.map