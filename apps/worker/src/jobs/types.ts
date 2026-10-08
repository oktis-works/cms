// @oktis-works/worker - Job Types

export interface JobData {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  tenantId: string;
  userId?: string;
  createdAt: Date;
}

export interface JobResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export type JobHandler = (job: JobData) => Promise<JobResult>;

// Job type definitions
export interface ContentPublishJob extends JobData {
  type: 'content.publish';
  payload: {
    contentId: string;
    scheduledAt?: Date;
  };
}

export interface ContentUnpublishJob extends JobData {
  type: 'content.unpublish';
  payload: {
    contentId: string;
  };
}

export interface MediaProcessJob extends JobData {
  type: 'media.process';
  payload: {
    mediaId: string;
    operations: Array<{
      type: 'resize' | 'thumbnail' | 'compress' | 'optimize' | 'convert';
      options: Record<string, unknown>;
    }>;
  };
}

export interface BuildCreateJob extends JobData {
  type: 'build.create';
  payload: {
    buildId: string;
    plugins: Record<string, string>;
    theme: Record<string, string>;
  };
}

export interface DeploymentCreateJob extends JobData {
  type: 'deployment.create';
  payload: {
    deploymentId: string;
    buildId: string;
  };
}

export interface WebhookSendJob extends JobData {
  type: 'webhook.send';
  payload: {
    webhookId: string;
    event: string;
    data: Record<string, unknown>;
  };
}

export interface CleanupExpiredSessionsJob extends JobData {
  type: 'cleanup.expired_sessions';
  payload: Record<string, never>;
}

export interface CleanupExpiredAuditLogsJob extends JobData {
  type: 'cleanup.expired_audit_logs';
  payload: Record<string, never>;
}

export interface CacheInvalidateJob extends JobData {
  type: 'cache.invalidate';
  payload: {
    pattern: string;
  };
}

export type AnyJob =
  | ContentPublishJob
  | ContentUnpublishJob
  | MediaProcessJob
  | BuildCreateJob
  | DeploymentCreateJob
  | WebhookSendJob
  | CleanupExpiredSessionsJob
  | CleanupExpiredAuditLogsJob
  | CacheInvalidateJob;
