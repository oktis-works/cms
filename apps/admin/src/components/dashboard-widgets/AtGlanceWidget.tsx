import { Show, createSignal, onMount } from 'solid-js';
import { useTranslation } from '../../i18n';
import { apiClient } from '../../lib/api';
import { APP_VERSION } from '../../lib/version';

interface DashboardWidgetProps {
  title: string;
  children: any;
  columns?: number;
  className?: string;
  /** Id do painel no "Screen Options" — vira data-widget-panel no DOM */
  panelId?: string;
}

export function DashboardWidget(props: DashboardWidgetProps) {
  return (
    <div class={`dashboard-widget ${props.className || ''}`} data-widget-panel={props.panelId} style={`grid-column: span ${props.columns || 1}`}>
      <div class="dashboard-widget-header">
        <h3 class="dashboard-widget-title">{props.title}</h3>
      </div>
      <div class="dashboard-widget-content">
        {props.children}
      </div>
      <style>{`
        .dashboard-widget {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          display: flex;
          flex-direction: column;
          min-height: 200px;
          transition: all 0.15s ease;
        }
        .dashboard-widget:hover { border-color: var(--color-primary); box-shadow: var(--shadow-md); }
        .dashboard-widget-header {
          padding: 1rem 1.25rem;
          border-bottom: 1px solid var(--color-border);
          display: flex; align-items: center; justify-content: space-between;
        }
        .dashboard-widget-title { font-size: 0.875rem; font-weight: 600; color: var(--color-text); }
        .dashboard-widget-content { padding: 1.25rem; flex: 1; }
      `}</style>
    </div>
  );
}

interface AtGlanceStats {
  posts: { published: number; drafts: number; trash: number };
  pages: { published: number; drafts: number; trash: number };
  media: { total: number };
  users: { total: number; active: number; inactive: number };
  storage: { used: string };
  version: string;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function AtGlanceWidget() {
  const { t } = useTranslation();
  const [stats, setStats] = createSignal<AtGlanceStats | null>(null);
  const [loading, setLoading] = createSignal(true);

  onMount(async () => {
    try {
      // Dados reais do backend: conteúdo, mídia (contagem + bytes) e usuários
      const [content, media, users] = await Promise.all([
        apiClient.getContent({ limit: 1000 }),
        apiClient.listMedia({ limit: 1000 }),
        apiClient.listUsers({ limit: 1000 }),
      ]);

      const contentData = content.data ?? [];
      const mediaData = media.data ?? [];
      const usersData = users.data ?? [];
      const storageBytes = mediaData.reduce((sum, file) => sum + (Number(file.size) || 0), 0);

      setStats({
        posts: {
          published: contentData.filter(c => c.type === 'post' && c.status === 'PUBLISHED').length,
          drafts: contentData.filter(c => c.type === 'post' && c.status === 'DRAFT').length,
          trash: contentData.filter(c => c.type === 'post' && c.status === 'TRASHED').length,
        },
        pages: {
          published: contentData.filter(c => c.type === 'page' && c.status === 'PUBLISHED').length,
          drafts: contentData.filter(c => c.type === 'page' && c.status === 'DRAFT').length,
          trash: contentData.filter(c => c.type === 'page' && c.status === 'TRASHED').length,
        },
        media: { total: media.total ?? mediaData.length },
        users: {
          total: usersData.length,
          active: usersData.filter(u => u.status === 'ACTIVE').length,
          inactive: usersData.filter(u => u.status === 'INACTIVE').length,
        },
        storage: { used: formatBytes(storageBytes) },
        version: APP_VERSION,
      });
    } catch (e) {
      console.error('Failed to load At Glance stats:', e);
    } finally {
      setLoading(false);
    }
  });

  return (
    <DashboardWidget title={t('dashboard.widgets.atGlance')} panelId="at-glance">
      <Show when={loading()} fallback={<div class="stat-grid skeleton">Loading...</div>}>
        <div class="stat-grid">
          <div class="stat-item">
            <span class="stat-label">{t('dashboard.widgets.posts')}</span>
            <div class="stat-values">
              <span class="stat-value published">{stats()?.posts.published ?? 0}</span>
              <span class="stat-separator">/</span>
              <span class="stat-value draft">{stats()?.posts.drafts ?? 0}</span>
              <span class="stat-separator">/</span>
              <span class="stat-value trash">{stats()?.posts.trash ?? 0}</span>
            </div>
            <span class="stat-desc">{t('dashboard.widgets.postsDesc')}</span>
          </div>

          <div class="stat-item">
            <span class="stat-label">{t('dashboard.widgets.pages')}</span>
            <div class="stat-values">
              <span class="stat-value published">{stats()?.pages.published ?? 0}</span>
              <span class="stat-separator">/</span>
              <span class="stat-value draft">{stats()?.pages.drafts ?? 0}</span>
              <span class="stat-separator">/</span>
              <span class="stat-value trash">{stats()?.pages.trash ?? 0}</span>
            </div>
            <span class="stat-desc">{t('dashboard.widgets.pagesDesc')}</span>
          </div>

          <div class="stat-item">
            <span class="stat-label">{t('dashboard.widgets.media')}</span>
            <div class="stat-values">
              <span class="stat-value total">{stats()?.media.total ?? 0}</span>
            </div>
            <span class="stat-desc">{t('dashboard.widgets.mediaDesc')}</span>
          </div>

          <div class="stat-item">
            <span class="stat-label">{t('dashboard.widgets.users')}</span>
            <div class="stat-values">
              <span class="stat-value total">{stats()?.users.total ?? 0}</span>
              <span class="stat-separator">/</span>
              <span class="stat-value active">{stats()?.users.active ?? 0}</span>
              <span class="stat-separator">/</span>
              <span class="stat-value inactive">{stats()?.users.inactive ?? 0}</span>
            </div>
            <span class="stat-desc">{t('dashboard.widgets.usersDesc')}</span>
          </div>

          <div class="stat-item full-width">
            <span class="stat-label">{t('dashboard.widgets.version')}</span>
            <div class="version-info">
              <span class="version-label">OkCMS</span>
              <span class="version-number">{stats()?.version}</span>
              <span class="version-separator">|</span>
              <span class="storage-label">{t('dashboard.widgets.storage')}</span>
              <span class="storage-value">{stats()?.storage.used}</span>
            </div>
          </div>
        </div>
      </Show>

      <style>{`
        .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
        .stat-item { display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem; background: var(--color-background); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
        .stat-item.full-width { grid-column: 1 / -1; }
        .stat-label { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-muted); }
        .stat-values { display: flex; align-items: baseline; gap: 0.375rem; flex-wrap: wrap; }
        .stat-value { font-size: 1.5rem; font-weight: 700; color: var(--color-text); }
        .stat-value.published { color: var(--color-success); }
        .stat-value.draft { color: var(--color-warning); }
        .stat-value.trash { color: var(--color-muted); }
        .stat-value.pending { color: var(--color-warning); }
        .stat-value.approved { color: var(--color-success); }
        .stat-value.spam { color: var(--color-danger); }
        .stat-value.total { color: var(--color-primary); }
        .stat-value.active { color: var(--color-success); }
        .stat-value.inactive { color: var(--color-danger); }
        .stat-separator { color: var(--color-muted); }
        .stat-desc { font-size: 0.6875rem; color: var(--color-muted); }
        .version-info { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
        .version-label { font-weight: 500; color: var(--color-text); }
        .version-number { background: var(--color-primary-soft); color: var(--color-primary-hover); padding: 0.125rem 0.5rem; border-radius: var(--radius-sm); font-size: 0.8125rem; font-weight: 600; }
        .version-separator { color: var(--color-muted); }
        .storage-label { font-size: 0.8125rem; color: var(--color-muted); }
        .storage-value { font-weight: 600; color: var(--color-text); }
      `}</style>
    </DashboardWidget>
  );
}