// @oktis-works/core - Hook Points (WordPress-style Extension Surface)

import { getHookRegistry } from '@oktis-works/plugin-runtime';

export const HOOK_POINTS = {
  // Admin UI (FEAT-098)
  ADMIN_MENU: 'okcms.admin.menu',
  ADMIN_DASHBOARD_SETUP: 'plugin.admin:dashboard:setup',
  ADMIN_METABOXES: 'plugin.admin:metaboxes',
  ADMIN_NOTICES: 'admin:notices',
  MANAGE_COLUMNS: (type: string): string => `manage:${type}:columns`,
  MANAGE_COLUMN_CONTENT: (type: string, key: string): string => `manage:${type}:custom-column:${key}`,
  PLUGIN_ACTION_LINKS: 'plugin.action:links',

  // Data filters (FEAT-099)
  SETTINGS_DEFAULTS: (group: string): string => `settings:defaults:${group}`,
  BEFORE_SAVE_CONTENT: (type: string): string => `before_save_content_${type}`,
  AFTER_SAVE_CONTENT: (type: string): string => `after_save_content_${type}`,
  BEFORE_PUBLISH_CONTENT: (type: string): string => `before_publish_content_${type}`,
  AFTER_PUBLISH_CONTENT: (type: string): string => `after_publish_content_${type}`,
  BEFORE_DELETE_CONTENT: (type: string): string => `before_delete_content_${type}`,
  AFTER_DELETE_CONTENT: (type: string): string => `after_delete_content_${type}`,
  CONTENT_QUERY: 'content:query',
  MEDIA_META: 'media:meta',
  USER_PROFILE_FIELDS: 'user:profile-fields',
  REST_RESPONSE: (resource: string): string => `rest:${resource}:response`,

  // Theme delivery (FEAT-100)
  THEME_DATA: (method: string): string => `theme:data:${method}`,
  THEME_BEFORE_RENDER: 'theme:before:render',
  THEME_AFTER_RENDER: 'theme:after:render',
  THEME_HEAD: 'theme:head',
} as const;

export function hooks() {
  return getHookRegistry();
}
