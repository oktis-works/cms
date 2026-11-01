// @oktis-works/database - RLS Helpers

/**
 * Creates a standard user-based RLS policy expression.
 * Plugins can use this in their migrations for per-user data isolation.
 *
 * @param table - Table name (for documentation purposes)
 * @param userIdColumn - Column name storing the user ID (default: 'user_id')
 * @returns SQL expression for USING clause
 *
 * @example
 * ```sql
 * CREATE POLICY user_own_orders ON orders
 * FOR ALL USING (user_id = current_user_id());
 * ```
 * Or using the helper:
 * ```typescript
 * const policy = createUserRlsPolicy('orders', 'user_id');
 * // Returns: "user_id = current_user_id()"
 * ```
 */
export function createUserRlsPolicy(table: string, userIdColumn = 'user_id'): string {
  return `${userIdColumn} = current_user_id()`;
}

/**
 * Creates a standard tenant + user RLS policy expression.
 * For tables that need both tenant and user isolation.
 */
export function createTenantUserRlsPolicy(
  table: string,
  tenantIdColumn = 'tenant_id',
  userIdColumn = 'user_id'
): string {
  return `${tenantIdColumn} = current_setting('app.current_tenant_id', true)::uuid AND ${userIdColumn} = current_user_id()`;
}