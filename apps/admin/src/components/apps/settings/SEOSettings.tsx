// @oktis-works/admin - Settings → SEO (grupo "seo")
// Configurações de SEO: site title/description/url, robots.txt, sitemap, Open Graph, Twitter Cards.

import { Show, createMemo, createSignal, onMount } from '@oktis-works/ui';
import { Card, Input, Select, Button } from '@oktis-works/ui';
import { apiClient } from '../../../lib/api';
import { useTranslation } from '../../../i18n';

interface FieldDef {
  key: string;
  label: string;
  hint?: string;
  type: 'text' | 'textarea' | 'select' | 'toggle' | 'number';
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
}

export function SEOSettings() {
  const { t } = useTranslation();
  const [values, setValues] = createSignal<Record<string, string>>({});
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal('');
  const [info, setInfo] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  const robotsOptions = createMemo(() => [
    { value: 'index,follow', label: 'Index, Follow' },
    { value: 'noindex,follow', label: 'No Index, Follow' },
    { value: 'index,nofollow', label: 'Index, No Follow' },
    { value: 'noindex,nofollow', label: 'No Index, No Follow' },
  ]);

  const changefreqOptions = createMemo(() => [
    { value: 'always', label: 'Always' },
    { value: 'hourly', label: 'Hourly' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' },
    { value: 'never', label: 'Never' },
  ]);

  const ogTypeOptions = createMemo(() => [
    { value: 'website', label: 'Website' },
    { value: 'article', label: 'Article' },
    { value: 'profile', label: 'Profile' },
    { value: 'book', label: 'Book' },
  ]);

  const twitterCardOptions = createMemo(() => [
    { value: 'summary', label: 'Summary' },
    { value: 'summary_large_image', label: 'Summary with Large Image' },
  ]);

  const fields = createMemo<FieldDef[]>(() => [
    // Site-wide
    { key: 'seo.siteTitle', label: t('settings.seo.fields.siteTitle'), type: 'text', placeholder: t('settings.seo.fields.siteTitlePlaceholder') },
    { key: 'seo.siteDescription', label: t('settings.seo.fields.siteDescription'), type: 'text', placeholder: t('settings.seo.fields.siteDescriptionPlaceholder') },
    { key: 'seo.siteUrl', label: t('settings.seo.fields.siteUrl'), type: 'text', placeholder: t('settings.seo.fields.siteUrlPlaceholder') },
    { key: 'seo.language', label: t('settings.seo.fields.language'), type: 'text', placeholder: t('settings.seo.fields.languagePlaceholder') },

    // Robots
    { key: 'seo.robotsEnabled', label: t('settings.seo.robots.enabled'), hint: t('settings.seo.robots.enabledHint'), type: 'toggle' },
    { key: 'seo.robotsRules', label: t('settings.seo.robots.rules'), type: 'textarea', placeholder: t('settings.seo.robots.rulesPlaceholder') },
    { key: 'seo.defaultRobots', label: t('settings.seo.robots.defaultRobots'), hint: t('settings.seo.robots.defaultRobotsHint'), type: 'select', options: robotsOptions() },

    // Sitemap
    { key: 'seo.sitemapEnabled', label: t('settings.seo.sitemap.enabled'), hint: t('settings.seo.sitemap.enabledHint'), type: 'toggle' },
    { key: 'seo.sitemapMaxItems', label: t('settings.seo.sitemap.maxItems'), type: 'number', placeholder: t('settings.seo.sitemap.maxItemsPlaceholder') },
    { key: 'seo.sitemapIncludeTypes', label: t('settings.seo.sitemap.includeTypes'), hint: t('settings.seo.sitemap.includeTypesHint'), type: 'text', placeholder: t('settings.seo.sitemap.includeTypesPlaceholder') },
    { key: 'seo.defaultChangefreq', label: t('settings.seo.sitemap.changefreq'), type: 'select', options: changefreqOptions() },
    { key: 'seo.defaultPriority', label: t('settings.seo.sitemap.priority'), hint: t('settings.seo.sitemap.priorityHint'), type: 'number', placeholder: '0.5' },

    // Open Graph
    { key: 'seo.ogType', label: t('settings.seo.og.type'), type: 'select', options: ogTypeOptions() },
    { key: 'seo.ogImage', label: t('settings.seo.og.image'), type: 'text', placeholder: t('settings.seo.og.imagePlaceholder') },

    // Twitter
    { key: 'seo.twitterCard', label: t('settings.seo.twitter.card'), hint: t('settings.seo.twitter.cardHint'), type: 'select', options: twitterCardOptions() },
  ]);

  onMount(async () => {
    try {
      const rows = await apiClient.getSettings('seo');
      const map: Record<string, string> = {};
      for (const row of rows) {
        map[row.key] = typeof row.value === 'string' ? row.value : JSON.stringify(row.value ?? '');
      }
      for (const field of fields()) {
        if (map[field.key] === undefined) map[field.key] = '';
      }
      setValues(map);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  });

  const submit = async (event: Event): Promise<void> => {
    event.preventDefault();
    setError('');
    setInfo('');
    setSaving(true);

    try {
      const current = await apiClient.getSettings('seo');
      const existing = new Map(current.map((row) => [row.key, row]));

      await apiClient.updateSettings(
        fields().map((field) => {
          const row = existing.get(field.key);
          return {
            key: field.key,
            value: values()[field.key] ?? '',
            group: row?.group ?? 'seo',
            type: row?.type ?? 'string',
          };
        })
      );

      setInfo(t('settings.seo.saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="seo-settings">
      <Show when={error()}>
        <div class="notice notice--error">{error()}</div>
      </Show>
      <Show when={info()}>
        <div class="notice">{info()}</div>
      </Show>

      <Show when={loaded()} fallback={<p class="muted">{t('settings.seo.loading')}</p>}>
        <Card>
          <form onSubmit={submit}>
            <div class="form-grid">
              {fields().map((field) => {
                if (field.type === 'toggle') {
                  const isChecked = values()[field.key] === 'true';
                  return (
                    <div class="seo-settings__toggle">
                      <label class="field__label">
                        {field.label}
                        <input
                          type="checkbox"
                          class="toggle"
                          checked={isChecked}
                          onInput={(event) => {
                            const target = event.target as HTMLInputElement;
                            setValues({ ...values(), [field.key]: target.checked ? 'true' : 'false' });
                          }}
                        />
                      </label>
                      {field.hint && <span class="hint">{field.hint}</span>}
                    </div>
                  );
                }
                if (field.type === 'textarea') {
                  return (
                    <div class="field">
                      <label class="field__label">{field.label}</label>
                      <textarea
                        name={field.key}
                        class="input"
                        placeholder={field.placeholder ?? ''}
                        value={values()[field.key] ?? ''}
                        onInput={(event) => {
                          const target = event.target as HTMLTextAreaElement;
                          setValues({ ...values(), [field.key]: target.value });
                        }}
                      />
                      {field.hint && <p class="field__hint">{field.hint}</p>}
                    </div>
                  );
                }
                if (field.type === 'select') {
                  return (
                    <Select
                      name={field.key}
                      label={field.label}
                      value={values()[field.key] ?? ''}
                      options={field.options ?? []}
                      onChange={(value: string) => setValues({ ...values(), [field.key]: value })}
                    />
                  );
                }
                return (
                  <Input
                    name={field.key}
                    label={field.label}
                    placeholder={field.placeholder ?? ''}
                    value={values()[field.key] ?? ''}
                    onInput={(value: string) => setValues({ ...values(), [field.key]: value })}
                  />
                );
              })}
            </div>
            <div class="media-details__actions">
              <Button variant="primary" type="submit" disabled={saving()} loading={saving()}>
                {t('settings.seo.save')}
              </Button>
            </div>
          </form>
        </Card>
      </Show>
    </div>
  );
}
