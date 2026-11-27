# Settings Contract

Settings are tenant-scoped records resolved with tenant precedence over platform-global values. Consumers must use the effective value returned by `SettingsService.get()`; callers must not deduplicate global and tenant rows themselves.

## Types and defaults

Core settings have canonical types and defaults. The API coerces safe string representations of booleans and numbers, and rejects invalid values. The Admin must send typed values and must not use an empty string as a missing boolean or numeric value.

Known public settings include the site identity fields and the SEO fields. New settings are internal by default.

## Visibility

Every setting has one visibility value:

- `public`: safe for theme render data;
- `admin`: available to authenticated Admin consumers only;
- `internal`: available to server-side Core and plugin code;
- `secret`: never exposed to public theme data.

Public exposure is explicit and is not inferred from a key name. Nested values must also be treated as untrusted data.

## Tenant and global values

There can be only one global row for a key. A tenant row overrides its global counterpart. Writes are tenant-scoped unless the caller explicitly uses the platform-global service path.

## Cache invalidation

Tenant-dependent settings, including timezone settings, must be cached per tenant or per request. An update must invalidate only the affected tenant. A process-global cache is forbidden for tenant configuration.
