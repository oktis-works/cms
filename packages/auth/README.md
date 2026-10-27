# @oktis-works/auth

Authentication & authorization — JWT, passwords, permissions, sessions.

## Password Hashing (Argon2id)

```typescript
import { hashPassword, verifyPassword } from '@oktis-works/auth';

const hash = await hashPassword('plaintext');  // Argon2id, salt auto-generated
const valid = await verifyPassword('plaintext', hash);
```

**Config (via `config`):**
- Algorithm: Argon2id (memory-hard, side-channel resistant)
- Memory: 64 MB
- Iterations: 3
- Parallelism: 4

## JWT Tokens

```typescript
import { createAccessToken, createRefreshToken, verifyToken } from '@oktis-works/auth';

const access = createAccessToken({ userId, tenantId, roles }, '15m');
const refresh = createRefreshToken({ userId, tenantId }, '7d');

const payload = verifyToken(token);  // throws if invalid/expired
```

**Claims:**
```typescript
interface JWTPayload {
  userId: string;
  tenantId: string;
  roles: string[];      // ['admin', 'editor']
  iat: number;
  exp: number;
}
```

**TTL (via config):**
- Access: 15 min (configurable via `jwt.accessTokenTtl`)
- Refresh: 7 days (configurable via `jwt.refreshTokenTtl`)

## Session Management

```typescript
import { createSession, getSession, destroySession } from '@oktis-works/auth';

const sessionId = await createSession(userId, tenantId, roles, '30d');
const session = await getSession(sessionId);
await destroySession(sessionId);
```

- Stored in `sessions` table with `expires_at`
- Cleaned by cron job

## Permissions

```typescript
import { requirePermission, hasPermission } from '@oktis-works/auth';

// Middleware (Hono)
app.get('/content', requirePermission('read', 'content'), handler);

// Programmatic
if (hasPermission(userRoles, 'content:create')) { ... }
```

**Format:** `{action}:{resource}` — `read:content`, `create:content`, `update:settings`, etc.

**System roles:**
- `superadmin` — all permissions
- `admin` — tenant admin (manage users, settings, plugins)
- `editor` — publish/unpublish, manage all content
- `author` — create/edit own content
- `contributor` — create/edit own drafts

## Middleware

```typescript
import { authMiddleware } from '@oktis-works/auth';

app.use('/api/*', authMiddleware);  // validates JWT, sets user/tenant on context
```

**Context after auth:**
```typescript
c.get('userId')      // string
c.get('tenantId')    // string
c.get('roles')       // string[]
c.get('user')        // full user object (if fetched)
```

## Password Reset

```typescript
import { generateResetToken, verifyResetToken, consumeResetToken } from '@oktis-works/auth';

const token = await generateResetToken(email);  // stored hashed, emailed to user
const payload = verifyResetToken(token);        // { email, exp }
await consumeResetToken(token);                 // marks used
```

## Multi-tenant

- All auth operations scoped to tenant via `runWithTenantContext`
- JWT includes `tenantId` claim
- Sessions tagged with `tenantId`

## Phase 1 Integration

- Content API routes use `requirePermission('create|read|update|delete', 'content')`
- Tenant ID injected from JWT (never from request body)
- `runWithTenantTransaction` wraps all content mutations