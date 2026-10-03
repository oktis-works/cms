// @oktis-works/admin - Settings → General (grupo "general")

import { For, Show, createSignal, onMount } from 'solid-js';
import { apiClient } from '../../../lib/api';

const FIELDS = [
  { key: 'siteTitle', label: 'Título do site', type: 'text', placeholder: 'Meu Site' },
  { key: 'siteDescription', label: 'Descrição', type: 'text', placeholder: 'Um novo site feito com OkCMS' },
  { key: 'language', label: 'Idioma', type: 'select', options: ['pt-BR', 'en-US', 'es-ES'] },
  { key: 'timezone', label: 'Fuso horário', type: 'text', placeholder: 'America/Sao_Paulo' },
] as const;

export function GeneralSettings() {
  const [values, setValues] = createSignal<Record<string, string>>({});
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal('');
  const [info, setInfo] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  onMount(async () => {
    try {
      const rows = await apiClient.getSettings('general');
      const map: Record<string, string> = {};
      for (const row of rows) {
        map[row.key] = typeof row.value === 'string' ? row.value : JSON.stringify(row.value ?? '');
      }
      // garante os campos na tela mesmo sem seed
      for (const field of FIELDS) {
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
      const current = await apiClient.getSettings('general');
      const existing = new Map(current.map((row) => [row.key, row]));

      await apiClient.updateSettings(
        FIELDS.map((field) => {
          const row = existing.get(field.key);
          return {
            key: field.key,
            value: values()[field.key] ?? '',
            group: row?.group ?? 'general',
            type: row?.type ?? 'string',
          };
        })
      );
      setInfo('Configurações salvas ✓');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="general-settings">
      <Show when={error()}>
        <div class="notice notice--error">{error()}</div>
      </Show>
      <Show when={info()}>
        <div class="notice">{info()}</div>
      </Show>

      <Show when={loaded()} fallback={<p class="muted">Carregando…</p>}>
        <form class="card" onSubmit={submit}>
          <h3>Geral</h3>
          <div class="form-grid">
            <For each={FIELDS}>
              {(field) => (
                <label>
                  {field.label}
                  <Show
                    when={field.type === 'select'}
                    fallback={
                      <input
                        class="input"
                        placeholder={'placeholder' in field ? field.placeholder : ''}
                        value={values()[field.key] ?? ''}
                        onInput={(e) => setValues({ ...values(), [field.key]: e.currentTarget.value })}
                      />
                    }
                  >
                    <select
                      class="input"
                      value={values()[field.key] ?? ''}
                      onChange={(e) => setValues({ ...values(), [field.key]: e.currentTarget.value })}
                    >
                      <For each={'options' in field ? field.options : []}>
                        {(option) => <option value={option}>{option}</option>}
                      </For>
                    </select>
                  </Show>
                </label>
              )}
            </For>
          </div>
          <div class="media-details__actions">
            <button class="btn btn-primary" type="submit" disabled={saving()}>
              {saving() ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </Show>
    </div>
  );
}
