import { createHmac, timingSafeEqual } from 'node:crypto';

interface ThemePreviewPayload {
  tenantId: string;
  themeId: string;
  userId: string;
  exp: number;
}

function previewSecret(): string {
  const secret = process.env['THEME_PREVIEW_SECRET'] ?? process.env['AUTH_JWT_SECRET'];
  if (!secret || secret.length < 32) {
    throw new Error('THEME_PREVIEW_SECRET must be configured with at least 32 characters');
  }
  return secret;
}

function sign(value: string): string {
  return createHmac('sha256', previewSecret()).update(value).digest('base64url');
}

export function createThemePreviewToken(input: {
  tenantId: string;
  themeId: string;
  userId: string;
  ttlSeconds?: number;
}): string {
  const payload: ThemePreviewPayload = {
    tenantId: input.tenantId,
    themeId: input.themeId,
    userId: input.userId,
    exp: Math.floor(Date.now() / 1000) + Math.min(Math.max(input.ttlSeconds ?? 300, 30), 900),
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

export function verifyThemePreviewToken(token: string): ThemePreviewPayload | null {
  try {
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return null;
    const expected = sign(encoded);
    const actualBuffer = Buffer.from(signature, 'base64url');
    const expectedBuffer = Buffer.from(expected, 'base64url');
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<ThemePreviewPayload>;
    if (
      typeof payload.tenantId !== 'string' ||
      typeof payload.themeId !== 'string' ||
      typeof payload.userId !== 'string' ||
      typeof payload.exp !== 'number' ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) return null;
    return payload as ThemePreviewPayload;
  } catch {
    return null;
  }
}
