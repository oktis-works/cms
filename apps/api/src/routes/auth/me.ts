import { Hono } from 'hono';
import { getConnection } from '@oktis-works/database';
import { authMiddleware } from '../../middleware/auth.js';

const router = new Hono();

router.use('*', authMiddleware);

router.get('/me', async (c) => {
  const userId = c.get('userId' as never) as string;
  const sql = getConnection();

  const result = await sql.unsafe(
    'SELECT id, email, name, avatar, status, last_login_at, created_at, updated_at FROM users WHERE id = $1',
    [userId]
  );

  if (result.length === 0) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json(result[0]);
});

export default router;
