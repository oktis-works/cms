// @oktis-works/admin - Settings → General (grupo "general")
// Migrada para o design-system @oktis-works/ui (Input/Select/Card/Button).
//
// Idioma: lista TODOS os locales suportados pelo admin (config.ts) e, ao
// salvar, aplica de verdade — escreve o cookie `admin_locale` (prioridade
// máxima no middleware i18n) e recarrega a página nas traduções novas.
// Timezone: dropdown buscável no formato do WordPress —
// `(UTC-03:00) America/Sao_Paulo` — salvando o id IANA.
import { Show, createMemo, createSignal, onMount } from '@oktis-works/ui';
import { Card, Input, Select, Button } from '@oktis-works/ui';
import { apiClient } from '../../../lib/api';
import { useTranslation } from '../../../i18n';
import { LOCALE_FLAGS, LOCALE_LABELS, SUPPORTED_LOCALES, isValidLocale } from '../../../i18n/config';
import { setCookieLocale } from '../../../i18n/locale';
import { TimezoneSelect } from './TimezoneSelect';
export function GeneralSettings() {
    const { t } = useTranslation();
    const [values, setValues] = createSignal({});
    const [loadedLanguage, setLoadedLanguage] = createSignal('');
    const [loaded, setLoaded] = createSignal(false);
    const [error, setError] = createSignal('');
    const [info, setInfo] = createSignal('');
    const [saving, setSaving] = createSignal(false);
    const languageOptions = createMemo(() => SUPPORTED_LOCALES.map((locale) => ({
        value: locale,
        label: `${LOCALE_FLAGS[locale]} ${LOCALE_LABELS[locale]}`,
    })));
    const fields = createMemo(() => [
        { key: 'siteTitle', label: t('settings.general.fields.siteTitle'), type: 'text', placeholder: t('settings.general.fields.siteTitlePlaceholder') },
        { key: 'siteDescription', label: t('settings.general.fields.siteDescription'), type: 'text', placeholder: t('settings.general.fields.siteDescriptionPlaceholder') },
        { key: 'language', label: t('settings.general.fields.language'), type: 'select', options: languageOptions() },
        { key: 'timezone', label: t('settings.general.fields.timezone'), type: 'timezone', placeholder: t('settings.general.fields.timezonePlaceholder') },
    ]);
    onMount(async () => {
        try {
            const rows = await apiClient.getSettings('general');
            const map = {};
            for (const row of rows) {
                map[row.key] = typeof row.value === 'string' ? row.value : JSON.stringify(row.value ?? '');
            }
            // garante os campos na tela mesmo sem seed
            for (const field of fields()) {
                if (map[field.key] === undefined)
                    map[field.key] = '';
            }
            // timezone vazio: pré-preenche com o fuso do navegador (valor só vai
            // para o banco no Save, como no WordPress)
            if (!map['timezone']) {
                try {
                    map['timezone'] = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
                }
                catch {
                    map['timezone'] = 'UTC';
                }
            }
            // idioma vazio: deixa em branco para o select mostrar o placeholder
            setLoadedLanguage(map['language'] ?? '');
            setValues(map);
            setLoaded(true);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    });
    const submit = async (event) => {
        event.preventDefault();
        setError('');
        setInfo('');
        setSaving(true);
        try {
            const current = await apiClient.getSettings('general');
            const existing = new Map(current.map((row) => [row.key, row]));
            await apiClient.updateSettings(fields().map((field) => {
                const row = existing.get(field.key);
                return {
                    key: field.key,
                    value: values()[field.key] ?? '',
                    group: row?.group ?? 'general',
                    type: row?.type ?? 'string',
                };
            }));
            // Aplica o idioma na hora: o middleware prioriza o cookie admin_locale,
            // então recarregar já rende a UI na tradução escolhida.
            const nextLanguage = values()['language'] ?? '';
            if (isValidLocale(nextLanguage) && nextLanguage !== loadedLanguage()) {
                setCookieLocale(nextLanguage);
                window.location.reload();
                return;
            }
            setInfo(t('settings.general.saved'));
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setSaving(false);
        }
    };
    return (<div class="general-settings">
      <Show when={error()}>
        <div class="notice notice--error">{error()}</div>
      </Show>
      <Show when={info()}>
        <div class="notice">{info()}</div>
      </Show>

      <Show when={loaded()} fallback={<p class="muted">{t('settings.general.loading')}</p>}>
        <Card>
          <form onSubmit={submit}>
            <div class="form-grid">
              {fields().map((field) => field.type === 'select' ? (<Select name={field.key} label={field.label} value={values()[field.key] ?? ''} options={field.options ?? []} onChange={(value) => setValues({ ...values(), [field.key]: value })}/>) : field.type === 'timezone' ? (<label class="general-settings__tz">
                    {field.label}
                    <TimezoneSelect value={values()[field.key] ?? ''} placeholder={field.placeholder ?? ''} searchPlaceholder={field.placeholder ?? ''} onChange={(value) => setValues({ ...values(), [field.key]: value })}/>
                  </label>) : (<Input name={field.key} label={field.label} placeholder={'placeholder' in field ? field.placeholder : ''} value={values()[field.key] ?? ''} onInput={(value) => setValues({ ...values(), [field.key]: value })}/>))}
            </div>
            <div class="media-details__actions">
              <Button variant="primary" type="submit" disabled={saving()} loading={saving()}>
                {t('settings.general.save')}
              </Button>
            </div>
          </form>
        </Card>
      </Show>
    </div>);
}
//# sourceMappingURL=GeneralSettings.jsx.map