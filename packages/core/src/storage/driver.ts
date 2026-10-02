// @oktis-works/core - Storage Driver Abstraction

export interface StorageObject {
  key: string;
  body: Buffer;
  contentType: string;
  size: number;
  etag?: string;
}

export interface StorageDriver {
  readonly name: 'local' | 's3' | 'r2' | 'minio';

  put(key: string, body: Buffer, contentType: string): Promise<{ key: string; etag?: string }>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  list(prefix: string): Promise<string[]>;
  publicUrl(key: string): string;
}
