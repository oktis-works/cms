import { describe, expect, it } from 'vitest';
import {
  canonicalFieldName,
  logicalValuesToBody,
  logicalValuesToNative,
  normalizeLogicalValues,
} from './field-values.js';

describe('canonical logical field values', () => {
  it('uses body over data, relational, and native compatibility sources', () => {
    const values = normalizeLogicalValues({
      body: { title: 'body', hero: 'body-value' },
      data: { title: 'data', hero: 'data-value' },
      relational: { hero: 'relational-value' },
      native: { title: 'native', featured_image_id: 'media-1' },
    });

    expect(values['title']).toBe('body');
    expect(values['hero']).toBe('body-value');
    expect(values['featured_image']).toBe('media-1');
  });

  it('preserves lower-precedence unknown values from JSON compatibility sources', () => {
    const values = normalizeLogicalValues({
      native: { nativeOnly: 'native', title: 'native-title' },
      relational: { relationalOnly: 'relational', title: 'relational-title' },
      data: { dataOnly: 'data', title: 'data-title' },
    });

    expect(values).toMatchObject({
      relationalOnly: 'relational',
      dataOnly: 'data',
      title: 'data-title',
    });
    expect(values['nativeOnly']).toBeUndefined();
  });

  it('normalizes legacy aliases and double-encoded bodies', () => {
    const values = normalizeLogicalValues({
      body: JSON.stringify({ html: '<p>Legacy</p>', seoTitle: 'SEO' }),
      native: { featuredImageId: 'media-2', author_id: 'user-1' },
    });

    expect(values['content']).toBe('<p>Legacy</p>');
    expect(values['seo_title']).toBe('SEO');
    expect(values['featured_image']).toBe('media-2');
    expect(values['author']).toBe('user-1');
  });

  it('maps logical values to the native compatibility columns', () => {
    expect(logicalValuesToNative({
      title: 'Title',
      featured_image: 'media-1',
      seo_title: 'SEO',
      author: 'user-1',
    })).toEqual({
      title: 'Title',
      slug: undefined,
      excerpt: undefined,
      featuredImageId: 'media-1',
      seoTitle: 'SEO',
      seoDescription: undefined,
      status: undefined,
      authorId: 'user-1',
    });
  });

  it('removes legacy aliases from the canonical body while preserving unknown fields', () => {
    expect(logicalValuesToBody({ featuredImageId: 'old', featured_image: 'new', custom: true })).toEqual({
      featured_image: 'new',
      custom: true,
    });
  });

  it('resolves compatibility names for helper calls', () => {
    expect(canonicalFieldName('featuredImageId')).toBe('featured_image');
    expect(canonicalFieldName('customField')).toBe('customField');
  });
});
