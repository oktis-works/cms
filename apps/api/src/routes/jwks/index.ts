// @oktis-works/api - JWKS Endpoint for JWT Key Rotation

import { Hono } from 'hono';
import { authMiddleware } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/auth.js';
import { loadConfig } from '@oktis-works/config';
import { AuthService } from '@oktis-works/auth';

const config = loadConfig();
const authService = new AuthService(config.auth);

const router = new Hono();

// Public JWKS endpoint - no auth required
router.get('/.well-known/jwks.json', async (c) => {
  const jwks = await authService.getJwks();
  return c.json(jwks);
});

// Admin endpoint to trigger key rotation (SUPER_ADMIN only)
router.post('/auth/rotate-keys', authMiddleware, requirePermission('create', 'plugin'), async (c) => {
  try {
    const newKid = await authService.rotateKeys();
    return c.json({ success: true, newKid, message: 'JWT keys rotated successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Key rotation failed';
    return c.json({ error: message }, 500);
  }
});

export default router;