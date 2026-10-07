// @oktis-works/auth - JWT Token Management

import type { AuthConfig } from '@oktis-works/config';

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

async function hmacSign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Buffer.from(signature).toString('base64url');
}

async function hmacVerify(data: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const sigBuffer = Buffer.from(signature, 'base64url');
  return crypto.subtle.verify('HMAC', key, sigBuffer, encoder.encode(data));
}

function base64urlEncode(data: string): string {
  return Buffer.from(data).toString('base64url');
}

function base64urlDecode(data: string): string {
  return Buffer.from(data, 'base64url').toString();
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

export class JWTService {
  private config: AuthConfig;

  constructor(config: AuthConfig) {
    this.config = config;
  }

  async generateTokenPair(payload: Omit<TokenPayload, 'iat' | 'exp'>): Promise<TokenPair> {
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
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = parseDuration(this.config.jwtExpiresIn);
    return this.sign({ ...payload, iat: now, exp: now + expiresIn });
  }

  async verifyToken(token: string): Promise<TokenPayload | null> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const [header, payload, signature] = parts;

      const data = `${header}.${payload}`;
      const valid = await hmacVerify(data, signature!, this.config.jwtSecret);
      if (!valid) return null;

      const decoded = JSON.parse(base64urlDecode(payload!)) as TokenPayload;

      if (decoded.exp < Math.floor(Date.now() / 1000)) {
        return null;
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
    const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64urlEncode(JSON.stringify(payload));
    const data = `${header}.${body}`;
    const signature = await hmacSign(data, this.config.jwtSecret);
    return `${data}.${signature}`;
  }
}
