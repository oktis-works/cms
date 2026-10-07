import { Hono } from 'hono';
import { getConnection } from '@oktis-works/database';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const router = new Hono();

router.use('*', authMiddleware);

router.get('/', requirePermission('read', 'system'), async (c) => {
  const page = Math.max(1, Number(c.req.query('page') ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 50) || 50));
  const type = c.req.query('type') || undefined;
  const offset = (page - 1) * limit;

  const sql = getConnection();

  let whereClause = 'WHERE 1=1';
  const params: string[] = [];
  if (type) {
    whereClause += ` AND type = $${params.length + 1}`;
    params.push(type);
  }

  const [data, countData] = await Promise.all([
    sql.unsafe(`SELECT * FROM events ${whereClause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params),
    sql.unsafe(`SELECT COUNT(*) as total FROM events ${whereClause}`, params),
  ]);

  return c.json({
    data,
    total: Number((countData[0] as Record<string, unknown>)?.['total'] ?? 0),
  });
});

export default router;
