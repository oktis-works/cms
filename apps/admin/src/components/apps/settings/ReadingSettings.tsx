// @oktis-works/admin - Settings → Reading (grupo "reading")
// Configuração de Static Front Page estilo WordPress.

import { Show, createSignal, onMount } from '@oktis-works/ui';
import { Card, Select, Button, Input } from '@oktis-works/ui';
import { apiClient } from '../../../lib/api';
import { useTranslation } from '../../../i18n';
import { TimezoneSelect } from './TimezoneSelect';

interface PageOption {
  value: string;
  label: string;
}

export function ReadingSettings() {
  const { t } = useTranslation();
  const [values, setValues] = createSignal<Record<string, string>>({
    frontPageDisplays: 'static',
    frontPage: '',
    postsPage: '',
    timezone_string: '',
    gmt_offset: '',
  });
  const [pages, setPages] = createSignal<PageOption[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal('');
  const [info, setInfo] = createSignal('');

  onMount(async () => {
    // Safety timeout: if loading takes >35s, show an error instead of a stuck spinner
    const safetyTimer = setTimeout(() => {
      setError('Loading timed out. Please check your connection and try again.');
      setLoading(false);
    }, 35000);

    try {
      // Load published pages (type=page) for the front page / posts page selects
      const pageRows = await apiClient.getContent({ type: 'page', status: 'PUBLISHED', limit: 100 });
      const pageOptions = pageRows.data.map((p) => ({
        value: p.id,
        label: p.title || p.slug,
      }));
      setPages(pageOptions);

      // Load existing reading settings
      const rows = await apiClient.getSettings('reading');
      const map: Record<string, string> = {};
      for (const row of rows) {
        map[row.key] = typeof row.value === 'string' ? row.value : JSON.stringify(row.value ?? '');
      }
      // Defaults
      if (!map['frontPageDisplays']) map['frontPageDisplays'] = 'static';
      setValues({
        frontPageDisplays: map['frontPageDisplays'] ?? 'static',
        frontPage: map['frontPage'] ?? '',
        postsPage: map['postsPage'] ?? '',
        timezone_string: map['timezone_string'] ?? '',
        gmt_offset: map['gmt_offset'] ?? '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(safetyTimer);
      setLoading(false);
    }
  });

  const submit = async (event: Event): Promise<void> => {
    event.preventDefault();
    setError('');
    setInfo('');
    setSaving(true);

    try {
      const v = values();
      const items = [
        { key: 'frontPageDisplays', value: v['frontPageDisplays'], group: 'reading', type: 'string' },
        { key: 'frontPage', value: v['frontPage'], group: 'reading', type: 'string' },
        { key: 'postsPage', value: v['postsPage'], group: 'reading', type: 'string' },
        { key: 'timezone_string', value: v['timezone_string'], group: 'reading', type: 'string' },
        { key: 'gmt_offset', value: v['gmt_offset'], group: 'reading', type: 'string' },
      ];
      await apiClient.updateSettings(items);
      setInfo(t('settings.reading.saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  // Reactive render: Solid component bodies run once, so the loading state
  // must be switched with <Show> (a top-level early return would freeze the
  // initial "Loading..." markup forever).
  return (
    <div class="reading-settings">
      <Show when={!loading()} fallback={<p class="muted">{t('settings.reading.loading')}</p>}>
        <Show when={error()}>
          <div class="notice notice--error">{error()}</div>
        </Show>
        <Show when={info()}>
          <div class="notice">{info()}</div>
        </Show>

        <Card>
          <form onSubmit={submit}>
            <div class="form-grid">
              <div class="form-field">
                <label>{t('settings.reading.frontPageDisplays')}</label>
                <Select
                  name="frontPageDisplays"
                  value={values()['frontPageDisplays']}
                  options={[
                    { value: 'latest', label: t('settings.reading.frontPageDisplaysOptions.latest') },
                    { value: 'static', label: t('settings.reading.frontPageDisplaysOptions.static') },
                  ]}
                  onChange={(value) => setValues({ ...values(), frontPageDisplays: value })}
                />
              </div>

              <Show when={values()['frontPageDisplays'] === 'static'}>
                <div class="form-field">
                  <label>{t('settings.reading.frontPage')}</label>
                  <Select
                    name="frontPage"
                    value={values()['frontPage']}
                    options={[{ value: '', label: t('settings.reading.selectPage') }, ...pages()]}
                    onChange={(value) => setValues({ ...values(), frontPage: value })}
                  />
                </div>

                <div class="form-field">
                  <label>{t('settings.reading.postsPage')}</label>
                  <Select
                    name="postsPage"
                    value={values()['postsPage']}
                    options={[{ value: '', label: t('settings.reading.selectPage') }, ...pages()]}
                    onChange={(value) => setValues({ ...values(), postsPage: value })}
                  />
                </div>
              </Show>

              <div class="form-field">
                <label>{t('settings.reading.timezoneString')}</label>
                <TimezoneSelect
                  value={values()['timezone_string'] ?? ''}
                  placeholder={t('settings.reading.timezoneStringPlaceholder')}
                  searchPlaceholder={t('settings.reading.timezoneStringPlaceholder')}
                  onChange={(value) => setValues({ ...values(), timezone_string: value })}
                />
                <p class="form-hint">{t('settings.reading.timezoneDescription')}</p>
              </div>

              <div class="form-field">
                <label>{t('settings.reading.gmtOffset')}</label>
                <Input
                  name="gmt_offset"
                  type="number"
                  value={values()['gmt_offset'] ?? ''}
                  placeholder={t('settings.reading.gmtOffsetPlaceholder')}
                  onInput={(value) => setValues({ ...values(), gmt_offset: value })}
                />
                <p class="form-hint">{t('settings.reading.gmtOffsetDescription')}</p>
              </div>
            </div>

            <div class="media-details__actions">
              <Button variant="primary" type="submit" disabled={saving()} loading={saving()}>
                {t('settings.reading.save')}
              </Button>
            </div>
          </form>
        </Card>
      </Show>
    </div>
  );
}