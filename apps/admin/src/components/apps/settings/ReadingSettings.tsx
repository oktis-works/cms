// @oktis-works/admin - Settings → Reading (grupo "reading")
// Configuração de Static Front Page estilo WordPress.

import { Show, createSignal, onMount } from '@oktis-works/ui';
import { Card, Select, Button } from '@oktis-works/ui';
import { apiClient } from '../../../lib/api';
import { useTranslation } from '../../../i18n';

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
  });
  const [pages, setPages] = createSignal<PageOption[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal('');
  const [info, setInfo] = createSignal('');

  onMount(async () => {
    try {
      // Carrega páginas publicadas (type=page) para os selects
      const pageRows = await apiClient.getContent({ type: 'page', status: 'PUBLISHED', limit: 100 });
      const pageOptions = pageRows.data.map((p) => ({
        value: p.id,
        label: p.title || p.slug,
      }));
      setPages(pageOptions);

      // Carrega settings de leitura existentes
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
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
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
      ];
      await apiClient.updateSettings(items);
      setInfo(t('settings.reading.saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading()) {
    return <p class="muted">{t('settings.reading.loading')}</p>;
  }

  return (
    <div class="reading-settings">
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
          </div>

          <div class="media-details__actions">
            <Button variant="primary" type="submit" disabled={saving()} loading={saving()}>
              {t('settings.reading.save')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}