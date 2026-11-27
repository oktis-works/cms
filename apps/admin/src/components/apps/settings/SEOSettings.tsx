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

type FieldValue = string | boolean | number;

const DEFAULTS: Record<string, FieldValue> = {
  'seo.robotsEnabled': true,
  'seo.robotsRules': '',
  'seo.defaultRobots': 'index,follow',
  'seo.sitemapEnabled': true,
  'seo.sitemapMaxItems': 50000,
  'seo.sitemapIncludeTypes': '',
  'seo.defaultChangefreq': 'weekly',
  'seo.defaultPriority': 0.5,
  'seo.ogType': 'website',
  'seo.ogImage': '',
  'seo.twitterCard': 'summary',
};

export function SEOSettings() {
  const { t } = useTranslation();
  const [values, setValues] = createSignal<Record<string, FieldValue>>({});
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal('');
  const [info, setInfo] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  const robotsOptions = createMemo(() => [
    { value: 'index,follow', label: t('settings.seo.options.indexFollow') },
    { value: 'noindex,follow', label: t('settings.seo.options.noIndexFollow') },
    { value: 'index,nofollow', label: t('settings.seo.options.indexNoFollow') },
    { value: 'noindex,nofollow', label: t('settings.seo.options.noIndexNoFollow') },
  ]);

  const changefreqOptions = createMemo(() => [
    { value: 'always', label: t('settings.seo.options.always') },
    { value: 'hourly', label: t('settings.seo.options.hourly') },
    { value: 'daily', label: t('settings.seo.options.daily') },
    { value: 'weekly', label: t('settings.seo.options.weekly') },
    { value: 'monthly', label: t('settings.seo.options.monthly') },
    { value: 'yearly', label: t('settings.seo.options.yearly') },
    { value: 'never', label: t('settings.seo.options.never') },
  ]);

  const ogTypeOptions = createMemo(() => [
    { value: 'website', label: t('settings.seo.options.website') },
    { value: 'article', label: t('settings.seo.options.article') },
    { value: 'profile', label: t('settings.seo.options.profile') },
    { value: 'book', label: t('settings.seo.options.book') },
  ]);

  const twitterCardOptions = createMemo(() => [
    { value: 'summary', label: t('settings.seo.options.summary') },
    { value: 'summary_large_image', label: t('settings.seo.options.summaryLargeImage') },
  ]);

  const fields = createMemo<FieldDef[]>(() => [
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
      const map: Record<string, FieldValue> = {};
      for (const row of rows) {
        const field = fields().find((candidate) => candidate.key === row.key);
        if (field?.type === 'toggle') map[row.key] = row.value === true || row.value === 'true';
        else if (field?.type === 'number') {
          const numberValue = Number(row.value);
          map[row.key] = Number.isFinite(numberValue) ? numberValue : DEFAULTS[row.key] ?? 0;
        } else map[row.key] = typeof row.value === 'string' ? row.value : String(row.value ?? '');
      }
      for (const field of fields()) {
        if (map[field.key] === undefined) map[field.key] = DEFAULTS[field.key] ?? '';
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
            value: values()[field.key] ?? DEFAULTS[field.key] ?? '',
            group: row?.group ?? 'seo',
            type: field.type === 'toggle' ? 'boolean' : field.type === 'number' ? (field.key === 'seo.sitemapMaxItems' ? 'integer' : 'number') : 'string',
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
                  const isChecked = values()[field.key] === true;
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
                            setValues({ ...values(), [field.key]: target.checked });
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
                        value={String(values()[field.key] ?? '')}
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
                        value={String(values()[field.key] ?? '')}
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
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={String(values()[field.key] ?? '')}
                    onInput={(value: string) => setValues({ ...values(), [field.key]: field.type === 'number' ? (Number(value) || 0) : value })}
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
