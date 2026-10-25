import { describe, expect, it } from 'vitest';
import { findFieldPathIssues } from './field-paths.js';

describe('logical field paths', () => {
  it('rejects duplicate top-level names and invalid names', () => {
    const issues = findFieldPathIssues([
      { name: 'hero' },
      { name: 'hero' },
      { name: 'not valid' },
    ]);
    expect(issues).toContain('Duplicate field name "hero" in root');
    expect(issues.some((issue) => issue.includes('Invalid field name'))).toBe(true);
  });

  it('allows the same nested name in separate containers but rejects repeats in one container', () => {
    expect(findFieldPathIssues([
      { name: 'left', subFields: [{ name: 'title' }] },
      { name: 'right', subFields: [{ name: 'title' }] },
    ])).toEqual([]);
    expect(findFieldPathIssues([{ name: 'group', subFields: [{ name: 'title' }, { name: 'title' }] }])).toContain(
      'Duplicate field name "title" in root.group'
    );
  });

  it('rejects malformed clone references', () => {
    expect(findFieldPathIssues([{ name: 'copy', type: 'clone', config: { clone: [1] } }])).toContain(
      'Clone field "copy" must reference field names'
    );
  });
});
