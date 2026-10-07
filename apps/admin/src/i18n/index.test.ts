import { describe, expect, it } from 'vitest';
import englishTranslations from './locales/en.json';
import { createSyncTFunction } from './index';
import type { TranslationMap } from './types';

describe('admin translations', () => {
  const t = createSyncTFunction(
    englishTranslations as TranslationMap,
    englishTranslations as TranslationMap,
  );

  it('resolves labels used by admin tables and forms', () => {
    expect(t('content.list.columns.title')).toBe('Title');
    expect(t('settings.general.fields.siteTitlePlaceholder')).toBe('My Site');
    expect(t('plugins.columns.name')).toBe('Name');
  });

  it('never exposes a dotted translation key when a label is missing', () => {
    expect(t('content.list.columns.missingLabel')).toBe('Missing Label');
  });
});
