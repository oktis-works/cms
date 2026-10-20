// @oktis-works/api - Comments routes (Item 11 do plugin-parity-plan)
//
// Public surface (no session): POST / submits a visitor comment (defaults to
// the PENDING moderation queue, honeypot + rate limit antispam) and
// GET /content/:contentId lists approved comments for a content item.
// Moderation surface (session + RBAC): list/patch/delete with the comment:*
// hooks firing through the core service.

import { Hono } from 'hono'
import { commentService } from '@oktis-works/core'
import { authMiddleware, requirePermission } from '../../middleware/auth.js'
import { rateLimitMiddleware } from '../../middleware/rate-limit.js'
import type { CommentStatus } from '@oktis-works/types'

const comments = new Hono()

const VALID_STATUSES = new Set(['PENDING', 'APPROVED', 'SPAM', 'TRASHED'])
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_BODY_LENGTH = 5000

/** Strips control characters and trims visitor-provided strings. */
function clean(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, maxLength)
}

// ── Public: submit a visitor comment (moderation queue + antispam) ──────────
comments.post(
  '/',
  rateLimitMiddleware({ max: 5, windowMs: 60_000, authMax: 10 }),
  async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>

      // Honeypot: real visitors never fill the hidden `website` field — bots
      // do. Reply 202 without persisting (no feedback loop for the bot).
      const honeypot = clean(body['website'], 500)
      if (honeypot.length > 0) {
        return c.json({ accepted: true }, 202)
      }

      const contentId = clean(body['contentId'], 64)
      const authorName = clean(body['authorName'], 255)
      const authorEmail = clean(body['authorEmail'], 255)
      const authorUrl = clean(body['authorUrl'], 500)
      const parentId = clean(body['parentId'], 64)
      const text = clean(body['body'], MAX_BODY_LENGTH)

      if (!contentId || !authorName || !text) {
        return c.json({ error: 'contentId, authorName and body are required' }, 400)
      }
      if (authorEmail && !EMAIL_PATTERN.test(authorEmail)) {
        return c.json({ error: 'Invalid authorEmail' }, 400)
      }

      const created = await commentService.create({
        contentId,
        parentId: parentId || null,
        authorName,
        authorEmail: authorEmail || null,
        authorUrl: authorUrl || null,
        body: text,
        // PENDING default = moderation queue (antispam plugins may flip to
        // SPAM through the comment:before_save filter)
        status: body['status'] === 'APPROVED' ? 'APPROVED' : 'PENDING',
        ipAddress: c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
        userAgent: c.req.header('user-agent')?.slice(0, 500) ?? null,
      })

      return c.json({ id: created.id, status: created.status }, 201)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create comment'
      return c.json({ error: message }, 500)
    }
  }
)

// ── Public: approved comments of a content item (site rendering) ────────────
comments.get('/content/:contentId', async (c) => {
  try {
    const contentId = c.req.param('contentId') as string
    const limit = Number(c.req.query('limit') ?? 50)
    const list = await commentService.listApprovedByContent(contentId, Number.isFinite(limit) ? limit : 50)
    return c.json(list)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list comments'
    return c.json({ error: message }, 500)
  }
})

// ── Moderation surface (session + RBAC) ─────────────────────────────────────
comments.use('*', authMiddleware)

// GET /comments — moderation list (status/contentId/search + pagination)
comments.get('/', requirePermission('read', 'comment'), async (c) => {
  try {
    const status = c.req.query('status')
    const list = await commentService.list({
      status: status && VALID_STATUSES.has(status) ? (status as CommentStatus) : undefined,
      contentId: c.req.query('contentId') || undefined,
      search: c.req.query('search') || undefined,
      limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined,
      offset: c.req.query('offset') ? Number(c.req.query('offset')) : undefined,
    })
    const counts = await commentService.countByStatus()
    return c.json({ comments: list, counts })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list comments'
    return c.json({ error: message }, 500)
  }
})

// GET /comments/counts — moderation dashboard counters
comments.get('/counts', requirePermission('read', 'comment'), async (c) => {
  try {
    return c.json(await commentService.countByStatus())
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to count comments'
    return c.json({ error: message }, 500)
  }
})

// PATCH /comments/:id — moderation transition or author/body edit
comments.patch('/:id', requirePermission('update', 'comment'), async (c) => {
  try {
    const id = c.req.param('id') as string
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>

    let updated = null
    if (typeof body['status'] === 'string') {
      if (!VALID_STATUSES.has(body['status'])) {
        return c.json({ error: 'Invalid status' }, 400)
      }
      updated = await commentService.setStatus(id, body['status'] as CommentStatus)
      if (updated && (typeof body['body'] === 'string' || typeof body['authorName'] === 'string')) {
        updated =
          (await commentService.update(id, {
            authorName: typeof body['authorName'] === 'string' ? clean(body['authorName'], 255) : undefined,
            body: typeof body['body'] === 'string' ? clean(body['body'], MAX_BODY_LENGTH) : undefined,
          })) ?? updated
      }
    } else {
      updated = await commentService.update(id, {
        authorName: typeof body['authorName'] === 'string' ? clean(body['authorName'], 255) : undefined,
        body: typeof body['body'] === 'string' ? clean(body['body'], MAX_BODY_LENGTH) : undefined,
      })
    }

    if (!updated) return c.json({ error: 'Comment not found' }, 404)
    return c.json(updated)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update comment'
    return c.json({ error: message }, 500)
  }
})

// DELETE /comments/:id
comments.delete('/:id', requirePermission('delete', 'comment'), async (c) => {
  try {
    const id = c.req.param('id') as string
    const deleted = await commentService.delete(id)
    if (!deleted) return c.json({ error: 'Comment not found' }, 404)
    return c.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete comment'
    return c.json({ error: message }, 500)
  }
})

export default comments
