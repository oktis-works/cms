-- @oktis-works/core - V028: User RLS Support
-- Adds current_user_id() function for per-user Row Level Security
-- This enables plugins to create policies like: USING (user_id = current_user_id())

-- Function to get current user ID from session setting
-- Returns NULL if not set (anonymous users)
CREATE OR REPLACE FUNCTION current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$;

COMMENT ON FUNCTION current_user_id() IS 'Returns the current user ID from app.current_user_id setting, or NULL for anonymous. Used in RLS policies for per-user data isolation.';

-- Note: The setting 'app.current_user_id' is set by the web auth middleware
-- when a user is authenticated. It should be set via:
-- SELECT set_config('app.current_user_id', $userId, false);
-- And cleared with:
-- RESET app.current_user_id;