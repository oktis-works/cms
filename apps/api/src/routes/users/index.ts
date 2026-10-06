import { Hono } from 'hono';
import { userService } from '@oktis-works/core';
import { resolveTenantId } from '@oktis-works/database';
import type { UserStatus } from '@oktis-works/types';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';
import { hashPassword } from '@oktis-works/auth';

const router = new Hono();

router.use('*', authMiddleware);

/** JWT guarda o slug (ex.: "default") ou UUID — resolve para o UUID do tenant. */
async function tenantUuid(c: { get: (key: string) => unknown }): Promise<string> {
  const raw = (c.get('tenantId') as string | undefined) ?? 'default';
  return resolveTenantId(raw);
}

/** Remove credenciais da resposta (o SELECT * traz password_hash). */
function sanitizeUser(user: Record<string, unknown>): Record<string, unknown> {
  const { password_hash: _ph, passwordHash: _ph2, ...rest } = user;
  return rest;
}

router.get('/', requirePermission('read', 'user'), async (c) => {
  const page = Number(c.req.query('page') ?? 1);
  const limit = Number(c.req.query('limit') ?? 20);
  const search = c.req.query('search') || undefined;
  const status = (c.req.query('status') || undefined) as UserStatus | undefined;

  const result = await userService.list({ page, limit, search, status });
  const tenantId = await tenantUuid(c);
  const rolesMap = await userService.rolesForUsers(
    result.data.map((u) => u.id),
    tenantId
  );

  return c.json({
    data: result.data.map((u) => ({
      ...sanitizeUser(u as unknown as Record<string, unknown>),
      roles: rolesMap[u.id] ?? [],
    })),
    total: result.total,
  });
});

router.post('/', requirePermission('create', 'user'), async (c) => {
  try {
    const body = await c.req.json();
    const passwordHash = await hashPassword(body.password);

    // Valida o papel ANTES de criar (evita usuário órfão se o roleId for ruim)
    let role: { id: string; slug: string } | null = null;
    if (typeof body.roleId === 'string' && body.roleId) {
      role = await userService.getRoleById(body.roleId);
      if (!role) return c.json({ error: 'Role not found' }, 404);
    }

    const result = await userService.create({
      email: body.email,
      name: body.name,
      passwordHash,
      avatar: body.avatar,
    });

    let roles: string[] = [];
    if (role) {
      const tenantId = await tenantUuid(c);
      await userService.addToTenant(result.id, tenantId, role.id);
      roles = [role.slug];
    }

    return c.json(
      { ...sanitizeUser(result as unknown as Record<string, unknown>), roles },
      201
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create user';
    return c.json({ error: message }, 400);
  }
});

/**
 * Locale preferido do usuário logado (i18n do admin).
 * GET  → { locale: string | null } — middleware do admin cai no cookie/browser quando null.
 * PUT  → persiste a escolha do seletor de idioma em users.locale.
 * Registrado antes de /:id por clareza (o caminho tem 2 segmentos e não casa com /:id).
 */
router.get('/me/locale', async (c) => {
  const userId = c.get('userId' as never) as string | undefined;
  if (!userId) return c.json({ error: 'Not authenticated' }, 401);

  const locale = await userService.getLocale(userId);
  return c.json({ locale: locale ?? null });
});

const LOCALE_RE = /^[a-z]{2}(-[A-Za-z0-9]{2,4})?$/;

router.put('/me/locale', async (c) => {
  const userId = c.get('userId' as never) as string | undefined;
  if (!userId) return c.json({ error: 'Not authenticated' }, 401);

  const body = (await c.req.json().catch(() => null)) as { locale?: unknown } | null;
  const locale = body?.locale;

  // corpo inválido ou sem a chave `locale` → 400 (só `null` limpa a preferência)
  if (locale === undefined) {
    return c.json({ error: 'Invalid locale' }, 400);
  }

  if (
    locale !== null &&
    (typeof locale !== 'string' || locale.length > 10 || !LOCALE_RE.test(locale))
  ) {
    return c.json({ error: 'Invalid locale' }, 400);
  }

  const value = locale as string | null;
  await userService.setLocale(userId, value);
  return c.json({ locale: value });
});

router.get('/:id', requirePermission('read', 'user'), async (c) => {
  const id = c.req.param('id') as string;
  const result = await userService.getById(id);
  if (!result) return c.json({ error: 'User not found' }, 404);

  const tenantId = await tenantUuid(c);
  const roles = await userService.rolesFor(result.id, tenantId);
  return c.json({
    ...sanitizeUser(result as unknown as Record<string, unknown>),
    roles,
  });
});

router.put('/:id', requirePermission('update', 'user'), async (c) => {
  try {
    const id = c.req.param('id') as string;
    const body = await c.req.json();

    const result = await userService.update(id, {
      name: body.name,
      email: body.email,
      avatar: body.avatar,
      status: body.status,
    });
    if (!result) return c.json({ error: 'User not found' }, 404);
    return c.json(sanitizeUser(result as unknown as Record<string, unknown>));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update user';
    return c.json({ error: message }, 400);
  }
});

router.put('/:id/password', requirePermission('update', 'user'), async (c) => {
  try {
    const id = c.req.param('id') as string;
    const body = await c.req.json();

    if (typeof body.password !== 'string' || body.password.length < 8) {
      return c.json({ error: 'Password must be at least 8 characters' }, 400);
    }

    const passwordHash = await hashPassword(body.password);
    const updated = await userService.updatePassword(id, passwordHash);
    if (!updated) return c.json({ error: 'User not found' }, 404);
    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update password';
    return c.json({ error: message }, 400);
  }
});

/** Atribui (ou troca) o papel do usuário no tenant atual. */
router.post('/:id/roles', requirePermission('update', 'user'), async (c) => {
  try {
    const id = c.req.param('id') as string;
    const body = await c.req.json();

    if (typeof body.roleId !== 'string' || !body.roleId) {
      return c.json({ error: 'Missing roleId' }, 400);
    }

    const user = await userService.getById(id);
    if (!user) return c.json({ error: 'User not found' }, 404);

    const tenantId = await tenantUuid(c);
    const roleExists = await userService.getRoleById(body.roleId);
    if (!roleExists) return c.json({ error: 'Role not found' }, 404);

    await userService.addToTenant(user.id, tenantId, body.roleId);
    const roles = await userService.rolesFor(user.id, tenantId);
    return c.json({ success: true, roles });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to assign role';
    return c.json({ error: message }, 400);
  }
});

router.delete('/:id/roles/:roleId', requirePermission('update', 'user'), async (c) => {
  const id = c.req.param('id') as string;
  const roleId = c.req.param('roleId') as string;

  const user = await userService.getById(id);
  if (!user) return c.json({ error: 'User not found' }, 404);

  const tenantId = await tenantUuid(c);
  await userService.removeFromTenant(user.id, tenantId, roleId);
  const roles = await userService.rolesFor(user.id, tenantId);
  return c.json({ success: true, roles });
});

router.delete('/:id', requirePermission('delete', 'user'), async (c) => {
  const id = c.req.param('id') as string;
  const deleted = await userService.delete(id);
  if (!deleted) return c.json({ error: 'User not found' }, 404);
  return c.json({ success: true });
});

export default router;
