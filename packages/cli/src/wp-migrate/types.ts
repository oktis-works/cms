/**
 * WordPress Database Schema Types
 * Type-safe interfaces for WP tables used in migration
 */

export interface WPUser {
  ID: number;
  user_login: string;
  user_pass: string;
  user_nicename: string;
  user_email: string;
  user_url: string;
  user_registered: string; // YYYY-MM-DD HH:MM:SS
  user_activation_key: string;
  user_status: number;
  display_name: string;
}

export interface WPUserMeta {
  umeta_id: number;
  user_id: number;
  meta_key: string;
  meta_value: string; // May be PHP serialized
}

export interface WPPost {
  ID: number;
  post_author: number;
  post_date: string; // YYYY-MM-DD HH:MM:SS
  post_date_gmt: string;
  post_content: string;
  post_title: string;
  post_excerpt: string;
  post_status: 'publish' | 'draft' | 'trash' | 'auto-draft' | 'inherit' | 'private' | 'future' | 'pending';
  comment_status: 'open' | 'closed';
  ping_status: 'open' | 'closed';
  post_password: string;
  post_name: string;
  to_ping: string;
  pinged: string;
  post_modified: string;
  post_modified_gmt: string;
  post_content_filtered: string;
  post_parent: number;
  guid: string;
  menu_order: number;
  post_type: string;
  post_mime_type: string;
  comment_count: number;
}

export interface WPPostMeta {
  meta_id: number;
  post_id: number;
  meta_key: string;
  meta_value: string; // May be PHP serialized
}

export interface WPTerm {
  term_id: number;
  name: string;
  slug: string;
  term_group: number;
}

export interface WPTermTaxonomy {
  term_taxonomy_id: number;
  term_id: number;
  taxonomy: string;
  description: string;
  parent: number;
  count: number;
}

export interface WPTermRelationship {
  object_id: number;
  term_taxonomy_id: number;
  term_order: number;
}

export interface WPTermMeta {
  meta_id: number;
  term_id: number;
  meta_key: string;
  meta_value: string; // May be PHP serialized
}

export interface WPComment {
  comment_ID: number;
  comment_post_ID: number;
  comment_author: string;
  comment_author_email: string;
  comment_author_url: string;
  comment_author_IP: string;
  comment_date: string;
  comment_date_gmt: string;
  comment_content: string;
  comment_karma: number;
  comment_approved: '0' | '1' | 'spam' | 'trash';
  comment_agent: string;
  comment_type: string;
  comment_parent: number;
  user_id: number;
}

export interface WPCommentMeta {
  meta_id: number;
  comment_id: number;
  meta_key: string;
  meta_value: string;
}

export interface WPOption {
  option_id: number;
  option_name: string;
  option_value: string; // May be PHP serialized
  autoload: 'yes' | 'no';
}

export interface WPLink {
  link_id: number;
  link_url: string;
  link_name: string;
  link_image: string;
  link_target: string;
  link_description: string;
  link_visible: 'Y' | 'N';
  link_owner: number;
  link_rating: number;
  link_updated: string;
  link_rel: string;
  link_notes: string;
  link_rss: string;
}

/**
 * Migration-specific types
 */

export interface WPTableCounts {
  users: number;
  usermeta: number;
  posts: number;
  postmeta: number;
  terms: number;
  term_taxonomy: number;
  term_relationships: number;
  termmeta: number;
  comments: number;
  commentmeta: number;
  options: number;
  links: number;
}

export interface WPMigrationConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  prefix: string;
  tenantSlug: string;
  dryRun: boolean;
  batchSize: number;
  resumeFrom?: string;
  skipUsers: boolean;
  skipMedia: boolean;
  copyFiles: boolean;
  authorMap: Map<number, string>; // WP user ID -> OkCMS user UUID
  outputReport?: string;
  outputJson?: string;
  outputSummary?: string;
  unmappedMetaKeys: string[];
}

export interface MigrationCheckpoint {
  phase: MigrationPhase;
  completedAt: string;
  stats: PhaseStats;
  idMaps: IDMaps;
}

export type MigrationPhase =
  | 'tenant-users'
  | 'content-types'
  | 'taxonomies'
  | 'content'
  | 'postmeta'
  | 'termmeta'
  | 'media'
  | 'content-taxonomy'
  | 'comments'
  | 'menus'
  | 'options'
  | 'redirects'
  | 'validation'
  | 'complete';

export interface PhaseStats {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  durationMs: number;
}

export interface IDMaps {
  user: Map<number, string>; // WP user ID -> OkCMS user UUID
  content: Map<number, string>; // WP post ID -> OkCMS content UUID
  term: Map<number, string>; // WP term_taxonomy_id -> OkCMS term UUID
  taxonomy: Map<string, string>; // WP taxonomy slug -> OkCMS taxonomy UUID
  media: Map<number, string>; // WP attachment ID -> OkCMS media UUID
  comment: Map<number, string>; // WP comment ID -> OkCMS comment UUID
  menu: Map<number, string>; // WP nav_menu term_id -> OkCMS menu UUID
  menuItem: Map<number, string>; // WP nav_menu_item ID -> OkCMS menu item index
}

export interface MigrationReport {
  startedAt: string;
  completedAt?: string;
  config: Omit<WPMigrationConfig, 'password'>;
  phases: Record<MigrationPhase, PhaseStats>;
  totals: PhaseStats;
  errors: MigrationError[];
  unmappedMetaKeys: string[];
  warnings: string[];
}

export interface MigrationError {
  phase: MigrationPhase;
  wpTable: string;
  wpId: number | string;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
  timestamp: string;
}

export interface WPContentTypeInfo {
  postType: string;
  count: number;
  samplePost?: WPPost;
  metaKeys: Set<string>;
  hasHierarchical: boolean;
  supports: string[];
}

export interface WPTaxonomyInfo {
  taxonomy: string;
  termCount: number;
  hierarchical: boolean;
  objectTypes: string[];
  labels: {
    name: string;
    singular_name: string;
    menu_name?: string;
  };
}

/**
 * PHP Serialized Value Types
 */
export type PHPSerializedValue =
  | string
  | number
  | boolean
  | null
  | PHPSerializedValue[]
  | { [key: string]: PHPSerializedValue }
  | { class: string; properties: { [key: string]: PHPSerializedValue } };

/**
 * ACF Field Group Structure (unserialized)
 */
export interface ACFFieldGroup {
  ID: number;
  key: string;
  title: string;
  fields: ACFField[];
  location: ACFLocationRule[][];
  menu_order: number;
  position: 'normal' | 'side' | 'acf_after_title';
  style: 'default' | 'seamless';
  label_placement: 'top' | 'left';
  instruction_placement: 'label' | 'field';
  hide_on_screen: string;
  active: boolean;
  description: string;
  show_in_rest: number;
  modified: number;
}

export interface ACFField {
  key: string;
  label: string;
  name: string;
  type: ACFFieldType;
  instructions: string;
  required: number;
  conditional_logic: number | ACFConditionalLogic[];
  wrapper: { width: string; class: string; id: string };
  default_value_text: string;
  // Type-specific properties
  // Text
  placeholder?: string;
  prepend?: string;
  append?: string;
  maxlength?: string;
  // Textarea
  rows?: number;
  new_lines?: 'wpautop' | 'br' | '';
  // Number
  min_num?: string;
  max_num?: string;
  step?: string;
  // Email/URL/Password
  // Select/Checkbox/Radio
  choices?: { [value: string]: string };
  allow_custom?: number;
  multiple?: number;
  ui?: number;
  ajax?: number;
  return_format_select?: 'value' | 'label' | 'both';
  // True/False
  message?: string;
  default_value_tf?: string | number;
  // File/Image
  return_format_file?: 'array' | 'url' | 'id';
  library?: 'all' | 'uploadedTo';
  min_size?: string;
  max_size?: string;
  mime_types?: string;
  // Gallery
  min_gallery?: number;
  max_gallery?: number;
  insert?: 'append' | 'prepend';
  // Relationship/Post Object
  post_type?: string[];
  taxonomy?: string[];
  filters?: string[];
  elements?: string[];
  // Page Link
  // Repeater/Flexible Content
  sub_fields?: ACFField[];
  min_repeater?: number;
  max_repeater?: number;
  layout?: 'table' | 'row' | 'block';
  button_label?: string;
  // Flexible Content
  layouts?: ACFFlexibleLayout[];
  // Clone
  clone?: string[];
  display?: 'seamless' | 'group';
  // Group
  // Tab
  // Accordion
}

export type ACFFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'url'
  | 'password'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'true_false'
  | 'file'
  | 'image'
  | 'gallery'
  | 'relationship'
  | 'post_object'
  | 'page_link'
  | 'repeater'
  | 'flexible_content'
  | 'clone'
  | 'group'
  | 'tab'
  | 'accordion'
  | 'wysiwyg'
  | 'date_picker'
  | 'date_time_picker'
  | 'time_picker'
  | 'color_picker'
  | 'google_map'
  | 'oembed'
  | 'taxonomy'
  | 'user'
  | 'link';

export interface ACFLocationRule {
  param: 'post_type' | 'post_template' | 'post_status' | 'post_format' | 'post' | 'page_type' | 'page_template' | 'page_parent' | 'taxonomy' | 'user_role' | 'current_user' | 'options_page';
  operator: '==' | '!=' | '>' | '<' | 'in' | 'not_in';
  value: string;
}

export interface ACFConditionalLogic {
  field: string;
  operator: '==' | '!=' | '>' | '<' | 'contains' | 'not_contains';
  value: string;
}

export interface ACFFlexibleLayout {
  key: string;
  name: string;
  label: string;
  display: 'block' | 'table' | 'row';
  sub_fields: ACFField[];
  min?: number;
  max?: number;
}

/**
 * WP Attachment Metadata (unserialized from _wp_attachment_metadata)
 */
export interface WPAttachmentMetadata {
  width?: number;
  height?: number;
  file?: string;
  filesize?: number;
  image_meta?: {
    aperture?: string;
    camera?: string;
    caption?: string;
    created_timestamp?: string;
    copyright?: string;
    focal_length?: string;
    iso?: string;
    shutter_speed?: string;
    title?: string;
    orientation?: string;
    keywords?: string[];
  };
  sizes?: {
    [sizeName: string]: {
      file: string;
      width: number;
      height: number;
      mime_type: string;
      filesize?: number;
      source_url?: string;
    };
  };
  original_image?: string;
}

/**
 * Yoast SEO Meta (common keys)
 */
export interface YoastSEOMeta {
  '_yoast_wpseo_title'?: string;
  '_yoast_wpseo_metadesc'?: string;
  '_yoast_wpseo_focuskw'?: string;
  '_yoast_wpseo_canonical'?: string;
  '_yoast_wpseo_noindex'?: string;
  '_yoast_wpseo_nofollow'?: string;
  '_yoast_wpseo_opengraph_title'?: string;
  '_yoast_wpseo_opengraph_description'?: string;
  '_yoast_wpseo_opengraph_image'?: string;
  '_yoast_wpseo_twitter_title'?: string;
  '_yoast_wpseo_twitter_description'?: string;
  '_yoast_wpseo_twitter_image'?: string;
}

/**
 * RankMath SEO Meta (common keys)
 */
export interface RankMathSEOMeta {
  'rank_math_title'?: string;
  'rank_math_description'?: string;
  'rank_math_focus_keyword'?: string;
  'rank_math_canonical_url'?: string;
  'rank_math_robots'?: string;
}

/**
 * Menu Item Meta (from wp_postmeta for nav_menu_item)
 */
export interface WPMenuItemMeta {
  '_menu_item_type'?: 'custom' | 'post_type' | 'taxonomy';
  '_menu_item_object_id'?: string;
  '_menu_item_object'?: string;
  '_menu_item_target'?: string;
  '_menu_item_classes'?: string; // serialized array
  '_menu_item_xfn'?: string;
  '_menu_item_url'?: string;
  '_menu_item_orphaned'?: string;
  '_menu_item_menu_item_parent'?: string; // Actually post_parent
}

/**
 * OkCMS Target Types (for mapping reference)
 */

export interface OkCMSContentInput {
  tenant_id: string;
  type: string;
  title: string;
  slug: string;
  body: Record<string, unknown>; // JSONB
  excerpt?: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'TRASHED';
  author_id: string;
  featured_image_id?: string;
  seo_title?: string;
  seo_description?: string;
  metadata: Record<string, unknown>;
  published_at?: Date;
  version: number;
  parent_id?: string;
  layout?: string;
  data: Record<string, unknown>;
}

export interface OkCMSFieldValueInput {
  field_definition_id: string;
  entity_type: 'content' | 'taxonomy_term';
  entity_id: string;
  value: Record<string, unknown>;
}

export interface OkCMSTaxonomyInput {
  tenant_id: string | null;
  name: string;
  slug: string;
  hierarchical: boolean;
  attach_to: string[];
  labels: Record<string, unknown>;
  meta: Record<string, unknown>;
  source: 'CORE' | 'PLUGIN' | 'ADMIN';
}

export interface OkCMSTaxonomyTermInput {
  taxonomy_id: string;
  tenant_id: string | null;
  name: string;
  slug: string;
  description?: string;
  parent_id?: string;
  meta: Record<string, unknown>;
}

export interface OkCMSMediaInput {
  tenant_id: string;
  filename: string;
  title?: string;
  mime_type: string;
  size: number;
  path: string;
  url: string;
  alt?: string;
  caption?: string;
  description?: string;
  metadata: Record<string, unknown>;
  uploaded_by: string;
}

export interface OkCMSCommentInput {
  tenant_id: string;
  content_id: string;
  parent_id?: string;
  author_name: string;
  author_email?: string;
  author_url?: string;
  author_id?: string;
  body: string;
  status: 'PENDING' | 'APPROVED' | 'SPAM' | 'TRASHED';
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
  updated_at: Date;
}

export interface OkCMSSettingInput {
  tenant_id: string | null;
  key: string;
  value: Record<string, unknown>;
  group: string;
  type: string;
}