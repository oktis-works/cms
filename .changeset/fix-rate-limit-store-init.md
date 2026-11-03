---
'@oktis-works/api': patch
---

Fix rate-limit store initialization: `getStore()` now guarantees a non-null
store by falling back to `MemoryStore` when Redis is unavailable, and
`initRedisClient()` is called explicitly in the API boot before rate-limit
middleware is registered. This prevents `TypeError: null is not an object
(evaluating '(await getStore()).consume')` on `/api/v1/*` routes when Redis
is not yet ready.
