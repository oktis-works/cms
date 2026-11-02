// @oktis-works/auth - JWT Token Management with RS256 Key Rotation

import type { AuthConfig } from '@oktis-works/config';

// Use global Web Crypto API types (available in Node.js 18+/Bun)
/// <reference lib="webworker" />

interface CryptoKeyPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

export interface TokenPayload {
  sub: string;
  email: string;
  tenantId: string;
  roles: string[];
  iat: number;
  exp: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface JwksResponse {
  keys: Jwk[];
}

export interface Jwk {
  kty: 'RSA';
  kid: string;
  use: 'sig';
  alg: 'RS256';
  n: string;
  e: string;
}

interface JwtKey {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  kid: string;
  createdAt: number;
}

function base64urlEncode(data: ArrayBuffer | Uint8Array | string): string {
  if (typeof data === 'string') {
    return Buffer.from(data).toString('base64url');
  }
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  return Buffer.from(bytes).toString('base64url');
}

function base64urlDecode(data: string): Uint8Array {
  return new Uint8Array(Buffer.from(data, 'base64url'));
}

function parseDuration(str: string): number {
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) return 900;
  const num = parseInt(match[1]!, 10);
  switch (match[2]) {
    case 's': return num;
    case 'm': return num * 60;
    case 'h': return num * 3600;
    case 'd': return num * 86400;
    default: return 900;
  }
}

async function importPrivateKey(pemBase64: string): Promise<CryptoKey> {
  const keyData = base64urlDecode(pemBase64);
  return crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function importPublicKey(pemBase64: string): Promise<CryptoKey> {
  const keyData = base64urlDecode(pemBase64);
  return crypto.subtle.importKey(
    'spki',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

async function rsaSign(data: string, privateKey: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, encoder.encode(data));
  return base64urlEncode(signature);
}

async function rsaVerify(data: string, signature: string, publicKey: CryptoKey): Promise<boolean> {
  const encoder = new TextEncoder();
  const sigBuffer = base64urlDecode(signature);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, sigBuffer, encoder.encode(data));
}

async function exportPublicKeyJwk(publicKey: CryptoKey, kid: string): Promise<Jwk> {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey) as Jwk;
  return {
    kty: 'RSA',
    kid,
    use: 'sig',
    alg: 'RS256',
    n: jwk.n!,
    e: jwk.e!,
  };
}

export class JWTService {
  private config: AuthConfig;
  private keyCache: Map<string, JwtKey> = new Map();
  private keysLoaded = false;

  constructor(config: AuthConfig) {
    this.config = config;
  }

  private async ensureKeysLoaded(): Promise<void> {
    if (this.keysLoaded) return;
    if (!this.config.jwtKeys) {
      // Dev/test fallback: generate an ephemeral in-memory key pair so JWT signing
      // works without pre-provisioned keys. Production deployments must set JWT_KEYS.
      const { privateKey, publicKey } = await generateRsaKeyPair();
      const kid = generateKeyId();
      const createdAt = Date.now();
      this.config.jwtKeys = {
        currentKid: kid,
        keys: { [kid]: { privateKey, publicKey, createdAt } },
        rotationDays: 90,
        gracePeriodDays: 30,
      };
    }
    for (const [kid, keyData] of Object.entries(this.config.jwtKeys.keys)) {
      try {
        const privateKey = await importPrivateKey(keyData.privateKey);
        const publicKey = await importPublicKey(keyData.publicKey);
        this.keyCache.set(kid, { privateKey, publicKey, kid, createdAt: keyData.createdAt });
      } catch (e) {
        console.error(`[JWT] Failed to load key ${kid}:`, e);
      }
    }
    this.keysLoaded = true;
  }

  private getCurrentKey(): JwtKey | null {
    if (!this.config.jwtKeys) return null;
    const keyData = this.config.jwtKeys.keys[this.config.jwtKeys.currentKid];
    if (!keyData) return null;
    const cached = this.keyCache.get(this.config.jwtKeys.currentKid);
    if (cached) return cached;
    return null;
  }

  async generateTokenPair(payload: Omit<TokenPayload, 'iat' | 'exp'>): Promise<TokenPair> {
    await this.ensureKeysLoaded();
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = parseDuration(this.config.jwtExpiresIn);
    const refreshExpiresIn = parseDuration(this.config.refreshTokenExpiresIn);

    const accessToken: TokenPayload = {
      ...payload,
      iat: now,
      exp: now + expiresIn,
    };

    const refreshToken: TokenPayload = {
      ...payload,
      iat: now,
      exp: now + refreshExpiresIn,
    };

    return {
      accessToken: await this.sign(accessToken),
      refreshToken: await this.sign(refreshToken),
    };
  }

  async generateAccessToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): Promise<string> {
    await this.ensureKeysLoaded();
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = parseDuration(this.config.jwtExpiresIn);
    return this.sign({ ...payload, iat: now, exp: now + expiresIn });
  }

  async verifyToken(token: string): Promise<TokenPayload | null> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const [headerB64, payloadB64, signature] = parts;
      if (!headerB64 || !payloadB64 || !signature) return null;
      const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString()) as { alg?: string; kid?: string };

      if (header.alg !== 'RS256') return null;
      if (!header.kid) return null;

      await this.ensureKeysLoaded();

      let key = this.keyCache.get(header.kid);
      if (!key) {
        const keyData = this.config.jwtKeys?.keys[header.kid];
        if (!keyData) return null;
        try {
          const privateKey = await importPrivateKey(keyData.privateKey);
          const publicKey = await importPublicKey(keyData.publicKey);
          key = { privateKey, publicKey, kid: header.kid, createdAt: keyData.createdAt };
          this.keyCache.set(header.kid, key);
        } catch {
          return null;
        }
      }

      const data = `${headerB64}.${payloadB64}`;
      const valid = await rsaVerify(data, signature!, key.publicKey);
      if (!valid) return null;

      const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as TokenPayload;

      if (decoded.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }

      if (this.config.jwtKeys) {
        const gracePeriodMs = (this.config.jwtKeys.gracePeriodDays ?? 30) * 24 * 60 * 60 * 1000;
        const keyAge = Date.now() - key.createdAt;
        if (keyAge > gracePeriodMs && header.kid !== this.config.jwtKeys.currentKid) {
          return null;
        }
      }

      return decoded;
    } catch {
      return null;
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenPair | null> {
    const payload = await this.verifyToken(refreshToken);
    if (!payload) return null;

    return this.generateTokenPair({
      sub: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      roles: payload.roles,
    });
  }

  private async sign(payload: TokenPayload): Promise<string> {
    await this.ensureKeysLoaded();
    const currentKey = this.getCurrentKey();
    if (!currentKey) {
      throw new Error('No current JWT key available for signing');
    }

    const header = { alg: 'RS256', typ: 'JWT', kid: currentKey.kid };
    const headerB64 = base64urlEncode(JSON.stringify(header));
    const payloadB64 = base64urlEncode(JSON.stringify(payload));
    const data = `${headerB64}.${payloadB64}`;
    const signature = await rsaSign(data, currentKey.privateKey);
    return `${data}.${signature}`;
  }

  async getJwks(): Promise<JwksResponse> {
    await this.ensureKeysLoaded();
    if (!this.config.jwtKeys) return { keys: [] };

    const keys: Jwk[] = [];
    const gracePeriodMs = (this.config.jwtKeys.gracePeriodDays ?? 30) * 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const [kid, key] of this.keyCache) {
      const keyData = this.config.jwtKeys.keys[kid];
      if (!keyData) continue;
      const keyAge = now - keyData.createdAt;
      if (kid === this.config.jwtKeys.currentKid || keyAge <= gracePeriodMs) {
        keys.push(await exportPublicKeyJwk(key.publicKey, kid));
      }
    }
    return { keys };
  }

  async rotateKeys(): Promise<string> {
    if (!this.config.jwtKeys) throw new Error('JWT keys not configured');

    const { privateKey, publicKey } = await generateRsaKeyPair();
    const kid = generateKeyId();
    const createdAt = Date.now();
    const now = createdAt;

    const cryptoPrivateKey = await importPrivateKey(privateKey);
    const cryptoPublicKey = await importPublicKey(publicKey);

    this.config.jwtKeys.currentKid = kid;
    this.config.jwtKeys.keys[kid] = { privateKey, publicKey, createdAt };
    this.keyCache.set(kid, { privateKey: cryptoPrivateKey, publicKey: cryptoPublicKey, kid, createdAt });

    const gracePeriodMs = (this.config.jwtKeys.gracePeriodDays ?? 30) * 24 * 60 * 60 * 1000;
    for (const [oldKid, keyData] of Object.entries(this.config.jwtKeys.keys)) {
      if (oldKid !== kid && now - keyData.createdAt > gracePeriodMs) {
        delete this.config.jwtKeys.keys[oldKid];
        this.keyCache.delete(oldKid);
      }
    }

    return kid;
  }
}

async function generateRsaKeyPair(): Promise<{ privateKey: string; publicKey: string }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  ) as CryptoKeyPair;
  const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  return {
    privateKey: base64urlEncode(privateKey),
    publicKey: base64urlEncode(publicKey),
  };
}

function generateKeyId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}