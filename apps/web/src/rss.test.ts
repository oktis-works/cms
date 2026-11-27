import { describe, expect, it } from 'vitest';
import { generateFeeds } from './rss.js';

describe('RSS and Atom feed generation', () => {
  it('escapes XML values, preserves canonical item URLs, and emits the configured language', () => {
    const { rss, atom } = generateFeeds({
      hubBase: 'projects',
      hubTitle: 'Projects & More',
      hubDescription: 'A <safe> feed',
      siteName: 'Example',
      siteUrl: 'https://example.test',
      contentType: 'project',
      language: 'en-US',
      feedUrl: '/projects/feed',
      items: [{
        title: 'A <project>',
        excerpt: 'Use & safely',
        slug: 'project',
        url: '/projects/client/project',
        published_at: '2026-01-01T00:00:00.000Z',
      }],
    });

    expect(rss).toContain('<language>en-US</language>');
    expect(rss).toContain('<title>Projects &amp; More</title>');
    expect(rss).toContain('<title>A &lt;project&gt;</title>');
    expect(rss).toContain('<description>Use &amp; safely</description>');
    expect(rss).toContain('https://example.test/projects/client/project');
    expect(atom).toContain('https://example.test/projects/client/project');
  });
});
