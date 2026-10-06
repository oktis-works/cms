// @oktis-works/admin - Dashboard (stats reais + conteúdo recente)

import { For, Show, createSignal, onMount } from 'solid-js';
import { apiClient, type Content } from '../../../lib/api';
import { useTranslation } from '../../../i18n';

function raw(row: Content): Record<string, unknown> {
  return row as unknown as Record<string, unknown>;
}

function formatDate(row: Content): string {
  const value = raw(row)['updated_at'] ?? raw(row)['updatedAt'] ?? raw(row)['created_at'];
  if (typeof value !== 'string') return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

export function DashboardHome() {
  const { t } = useTranslation();
  const [stats, setStats] = createSignal({
    total: '—',
    published: '—',
    drafts: '—',
    media: '—',
    users: '—',
  });
  const [recent, setRecent] = createSignal<Content[]>([]);
  const [error, setError] = createSignal('');

  onMount(async () => {
    const [all, published, drafts, media, users, recentList] = await Promise.allSettled([
      apiClient.getContent({ limit: 1 }),
      apiClient.getContent({ limit: 1, status: 'PUBLISHED' }),
      apiClient.getContent({ limit: 1, status: 'DRAFT' }),
      apiClient.listMedia({ limit: 1 }),
      apiClient.listUsers({ limit: 1 }),
      apiClient.getContent({ limit: 5 }),
    ]);

    const count = (result: PromiseSettledResult<{ total: number }>): string =>
      result.status === 'fulfilled' ? String(result.value.total) : '?';

    setStats({
      total: count(all),
      published: count(published),
      drafts: count(drafts),
      media: count(media),
      users: count(users),
    });

    if (recentList.status === 'fulfilled') {
      setRecent(recentList.value.data ?? []);
    } else {
      setError(
        recentList.reason instanceof Error ? recentList.reason.message : String(recentList.reason)
      );
    }
  });

  return (
    <div class="dashboard-home">
      <Show when={error()}>
        <div class="notice notice--error">{error()}</div>
      </Show>

      <div class="stats-grid">
        <div class="card stat-card">
          <h3 class="stat-label">{t('dashboard.stats.totalContent')}</h3>
          <p class="stat-value">{stats().total}</p>
        </div>
        <div class="card stat-card">
          <h3 class="stat-label">{t('dashboard.stats.published')}</h3>
          <p class="stat-value">{stats().published}</p>
        </div>
        <div class="card stat-card">
          <h3 class="stat-label">{t('dashboard.stats.drafts')}</h3>
          <p class="stat-value">{stats().drafts}</p>
        </div>
        <div class="card stat-card">
          <h3 class="stat-label">{t('dashboard.stats.mediaFiles')}</h3>
          <p class="stat-value">{stats().media}</p>
        </div>
        <div class="card stat-card">
          <h3 class="stat-label">{t('dashboard.stats.users')}</h3>
          <p class="stat-value">{stats().users}</p>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>{t('dashboard.recent.title')}</h3>
          <a href="/content" class="btn btn-secondary btn-sm">{t('dashboard.recent.viewAll')}</a>
        </div>

        <Show
          when={recent().length > 0}
          fallback={<p class="muted">{t('dashboard.recent.empty')}</p>}
        >
          <table class="table">
            <thead>
              <tr>
                <th>{t('dashboard.recent.columns.title')}</th>
                <th>{t('dashboard.recent.columns.type')}</th>
                <th>{t('dashboard.recent.columns.status')}</th>
                <th>{t('dashboard.recent.columns.updated')}</th>
              </tr>
            </thead>
            <tbody>
              <For each={recent()}>
                {(row) => (
                  <tr>
                    <td>
                      <a href={`/content/edit?id=${encodeURIComponent(String(raw(row)['id'] ?? ''))}`}>
                        {String(raw(row)['title'] ?? '—')}
                      </a>
                    </td>
                    <td>{String(raw(row)['type'] ?? '—')}</td>
                    <td>{String(raw(row)['status'] ?? '—')}</td>
                    <td class="muted">{formatDate(row)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </div>
    </div>
  );
}