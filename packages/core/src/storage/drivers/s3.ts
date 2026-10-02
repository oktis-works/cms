// @oktis-works/core - S3-Compatible Storage Driver

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import type { StorageDriver } from '../driver.js';

export class S3StorageDriver implements StorageDriver {
  readonly name: 's3' | 'r2' | 'minio';
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly endpoint?: string;
  private readonly publicBase?: string;

  constructor(config?: { name?: 's3' | 'r2' | 'minio'; bucket?: string; region?: string; endpoint?: string; accessKeyId?: string; secretAccessKey?: string; forcePathStyle?: boolean }) {
    this.name = config?.name ?? 's3';
    this.bucket = config?.bucket ?? process.env['STORAGE_S3_BUCKET'] ?? '';
    if (!this.bucket) {
      throw new Error(`[${this.name}] Bucket não configurado: defina config.bucket ou STORAGE_S3_BUCKET`);
    }
    this.region = config?.region ?? process.env['STORAGE_S3_REGION'] ?? 'us-east-1';
    const region = this.region;
    this.endpoint = config?.endpoint ?? process.env['STORAGE_S3_ENDPOINT'];

    this.client = new S3Client({
      region,
      endpoint: this.endpoint,
      credentials:
        config?.accessKeyId && config?.secretAccessKey
          ? {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            }
          : process.env['STORAGE_S3_ACCESS_KEY_ID'] && process.env['STORAGE_S3_SECRET_ACCESS_KEY']
            ? {
                accessKeyId: process.env['STORAGE_S3_ACCESS_KEY_ID'],
                secretAccessKey: process.env['STORAGE_S3_SECRET_ACCESS_KEY'],
              }
            : undefined,
      forcePathStyle: config?.forcePathStyle ?? Boolean(process.env['STORAGE_S3_ENDPOINT']),
    });

    this.publicBase = process.env['STORAGE_PUBLIC_BASE'];
  }

  async put(key: string, body: Buffer, contentType: string): Promise<{ key: string; etag?: string }> {
    const response = await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );

    return { key, etag: response.ETag };
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key })
      );

      if (!response.Body) return null;

      return Buffer.from(await response.Body.transformToByteArray());
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
      );
      return true;
    } catch {
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      );
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );

      for (const object of response.Contents ?? []) {
        if (object.Key) keys.push(object.Key);
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return keys;
  }

  publicUrl(key: string): string {
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    if (this.publicBase) return `${this.publicBase.replace(/\/$/, '')}/${encodedKey}`;
    if (this.endpoint) {
      return `${this.endpoint.replace(/\/$/, '')}/${this.bucket}/${encodedKey}`;
    }
    if (this.name === 'r2') {
      throw new Error('[r2] STORAGE_PUBLIC_BASE ou STORAGE_S3_ENDPOINT é obrigatório para publicUrl');
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${encodedKey}`;
  }
}
