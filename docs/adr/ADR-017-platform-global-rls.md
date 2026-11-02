# ADR-017: Platform-Global Settings and Plugins RLS Policy

## Status
Accepted

## Date
2026-11-01

## Context

The `settings` and `plugins` tables have Row Level Security (RLS) policies that allow `tenant_id IS NULL` rows to be visible across all tenants. This is an intentional design decision to support platform-global configuration.

### Current RLS Policies

```sql
-- settings table
CREATE POLICY tenant_isolation_settings ON settings
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid OR tenant_id IS NULL);

-- plugins table
CREATE POLICY tenant_isolation_plugins ON plugins
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid OR tenant_id IS NULL);
```

## Decision

We will maintain the current RLS policies that allow `tenant_id IS NULL` rows to be readable by all tenants. This enables:

1. **Platform-global settings**: Site-wide configuration (e.g., `siteTitle`, `siteDescription`, maintenance mode) that applies to all tenants without requiring per-tenant duplication.

2. **Platform-global plugins**: Plugins installed at the platform level (by SUPER_ADMIN) that are available to all tenants without requiring individual tenant activation.

3. **Operational simplicity**: Avoids the need to replicate global config across every tenant row.

## Security Considerations

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Cross-tenant data leakage | Low | Medium | Only platform admins (SUPER_ADMIN) can write `tenant_id IS NULL` rows. Tenants cannot modify global config. |
| Tenant enumeration via global settings | Low | Low | Global settings are intentionally public (e.g., site title). Sensitive data should never be stored in global settings. |
| Plugin visibility | Low | Low | Platform plugins are intentionally visible to all tenants. Tenant-specific plugins require explicit activation. |

### Access Control

- **Write access**: Only `SUPER_ADMIN` role can create/update rows with `tenant_id IS NULL` (enforced by application logic in API routes).
- **Read access**: All authenticated users can read global settings/plugins (required for normal operation).
- **Tenant isolation**: Tenant-specific rows (`tenant_id = <uuid>`) are strictly isolated by RLS.

## Alternatives Considered

### 1. Separate `platform_settings` / `platform_plugins` tables
- **Pros**: Clearer separation, no RLS complexity.
- **Cons**: More tables, additional JOINs, code duplication for similar operations.
- **Verdict**: Rejected - current approach is simpler and well-understood.

### 2. Strict RLS with no `tenant_id IS NULL` access
- **Pros**: Maximum isolation.
- **Cons**: Requires duplicating global config per tenant, breaks zero-config onboarding.
- **Verdict**: Rejected - operational burden too high.

### 3. RLS policy requiring `SUPER_ADMIN` role for global reads
- **Pros**: Stronger isolation.
- **Cons**: Breaks public-facing features (e.g., site title in themes, plugin catalog in admin).
- **Verdict**: Rejected - too restrictive for normal operation.

## Implementation Notes

### Settings Table
- `tenant_id IS NULL` rows represent platform-global settings.
- API routes for settings enforce `SUPER_ADMIN` check for write operations on global settings.
- Themes and public pages read global settings for fallback values.

### Plugins Table
- `tenant_id IS NULL` rows represent platform-global plugin artifacts (installed by SUPER_ADMIN).
- `plugin_tenants` table controls which tenant has which plugin enabled.
- Platform plugins are visible to all tenants but require tenant activation to run.

## Future Enhancements

### Optional: `PLATFORM_READ` Policy
If stricter access control is needed in the future, we can add a policy that requires `SUPER_ADMIN` role for reading `tenant_id IS NULL` rows:

```sql
-- Optional future enhancement
CREATE POLICY platform_read_settings ON settings
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR (tenant_id IS NULL AND current_setting('app.current_user_role', true) = 'SUPER_ADMIN')
  );
```

This would require setting `app.current_user_role` in the request context, which is not currently implemented.

## Related Documentation

- [Multi-Tenant Architecture](../docs/architecture/multi-tenancy.md)
- [Plugin System](../docs/plugins/README.md)
- [Settings API](../docs/api/settings.md)