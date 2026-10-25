// @oktis-works/core - Location rules tests
//
// WordPress-parity item E7: `block` location parameter — field groups can
// target editor blocks (namespaced `namespace/block`) so custom fields
// render inside plugin-built block editors.

import { describe, it, expect } from 'vitest';
import { matchLocationRules, type LocationContext, type LocationRule } from './location-rules.js';

const rules = (groups: LocationRule[][], context: LocationContext): boolean =>
  matchLocationRules(groups, context);

describe('matchLocationRules — content_type baseline', () => {
  it('matches eq/neq on content_type', () => {
    const context: LocationContext = { contentType: 'post' };
    expect(rules([[{ param: 'content_type', operator: 'eq', value: 'post' }]], context)).toBe(true);
    expect(rules([[{ param: 'content_type', operator: 'eq', value: 'page' }]], context)).toBe(false);
    expect(rules([[{ param: 'content_type', operator: 'neq', value: 'page' }]], context)).toBe(true);
  });

  it('OR between groups, AND within a group', () => {
    const context: LocationContext = { contentType: 'post', postStatus: 'DRAFT' };
    expect(
      rules(
        [
          [
            { param: 'content_type', operator: 'eq', value: 'post' },
            { param: 'post_status', operator: 'eq', value: 'DRAFT' },
          ],
        ],
        context
      )
    ).toBe(true);
    expect(
      rules([
        [{ param: 'content_type', operator: 'eq', value: 'page' }],
        [{ param: 'content_type', operator: 'eq', value: 'post' }],
      ], context)
    ).toBe(true);
  });
});

describe('matchLocationRules — block parameter (E7)', () => {
  it('matches field groups targeting a namespaced block type', () => {
    const context: LocationContext = { block: 'my-plugin/product-card' };
    expect(rules([[{ param: 'block', operator: 'eq', value: 'my-plugin/product-card' }]], context)).toBe(true);
    expect(rules([[{ param: 'block', operator: 'eq', value: 'other-plugin/product-card' }]], context)).toBe(false);
  });

  it('neq matches when the group targets other blocks', () => {
    const context: LocationContext = { block: 'my-plugin/hero' };
    expect(rules([[{ param: 'block', operator: 'neq', value: 'my-plugin/product-card' }]], context)).toBe(true);
    expect(rules([[{ param: 'block', operator: 'neq', value: 'my-plugin/hero' }]], context)).toBe(false);
  });

  it('combines block with content_type in the same AND group', () => {
    const context: LocationContext = { contentType: 'post', block: 'my-plugin/product-card' };
    expect(
      rules(
        [
          [
            { param: 'content_type', operator: 'eq', value: 'post' },
            { param: 'block', operator: 'eq', value: 'my-plugin/product-card' },
          ],
        ],
        context
      )
    ).toBe(true);
    expect(
      rules(
        [
          [
            { param: 'content_type', operator: 'eq', value: 'page' },
            { param: 'block', operator: 'eq', value: 'my-plugin/product-card' },
          ],
        ],
        context
      )
    ).toBe(false);
  });

  it('matches field groups for term meta editing (taxonomy-only context, Item 10)', () => {
    const context: LocationContext = { taxonomy: 'categoria' };
    expect(rules([[{ param: 'taxonomy', operator: 'eq', value: 'categoria' }]], context)).toBe(true);
    // groups bound to a content type do not leak into term screens
    expect(rules([[{ param: 'content_type', operator: 'eq', value: 'post' }]], context)).toBe(false);
    expect(rules([[{ param: 'taxonomy', operator: 'neq', value: 'etiqueta' }]], context)).toBe(true);
  });

  it('context without block does not match a block eq rule', () => {
    expect(rules([[{ param: 'block', operator: 'eq', value: 'my-plugin/product-card' }]], {})).toBe(false);
  });

  it('accepts the legacy shorthand format alongside block rules', () => {
    const context: LocationContext = { contentType: 'post' };
    expect(
      rules([[{ param: 'content_type', operator: 'eq', value: 'post' }]] as never, context)
    ).toBe(true);
  });
});

describe('matchLocationRules — complete location context matrix', () => {
  it('matches slug, term, role, template, and status together', () => {
    const context: LocationContext = {
      contentType: 'page',
      contentSlug: 'home',
      taxonomy: 'category',
      termSlug: 'news',
      userRole: 'EDITOR',
      pageTemplate: 'landing',
      postStatus: 'PUBLISHED',
    };

    expect(rules([[
      { param: 'content_type', operator: 'eq', value: 'page' },
      { param: 'content_slug', operator: 'eq', value: 'home' },
      { param: 'taxonomy', operator: 'eq', value: 'category' },
      { param: 'term', operator: 'eq', value: 'news' },
      { param: 'user_role', operator: 'eq', value: 'EDITOR' },
      { param: 'page_template', operator: 'eq', value: 'landing' },
      { param: 'post_status', operator: 'eq', value: 'PUBLISHED' },
    ]], context)).toBe(true);
    expect(rules([[{ param: 'content_slug', operator: 'eq', value: 'other' }]], context)).toBe(false);
    expect(rules([[{ param: 'term', operator: 'neq', value: 'archived' }]], context)).toBe(true);
  });
});
