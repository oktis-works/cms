import { For, createSignal, onMount } from 'solid-js';
import { useTranslation } from '../../i18n';
import { apiClient } from '../../lib/api';

interface ActivityItem {
  id: string;
  type: 'post_created' | 'post_updated' | 'post_published' | 'media_uploaded' | 'user_registered' | 'comment_added';
  user: { name: string; email: string };
  description: string;
  timestamp: string;
  url?: string;
}

export function ActivityWidget() {
  const { t } = useTranslation();
  const [activities, setActivities] = createSignal<ActivityItem[]>([]);
  const [loading, setLoading] = createSignal(true);

  onMount(async () => {
    try {
      const [contentRes, usersRes] = await Promise.all([
        // Backend: GET /api/v1/content (ordenado por created_at DESC)
        apiClient.getContent({ limit: 20 }),
        apiClient.listUsers({ limit: 5 })
      ]);

      const activities: ActivityItem[] = [];

      // Mudanças recentes de conteúdo — detalhe (autor) via /content/:id, em paralelo
      const recentContent = (contentRes.data ?? []).slice(0, 10);
      const details = await Promise.all(
        recentContent.map((item) => apiClient.getContentById(item.id).catch(() => null))
      );

      recentContent.forEach((item, index) => {
        const raw = item as unknown as Record<string, unknown>;
        const updatedAt = (raw['updated_at'] ?? raw['updatedAt'] ?? raw['created_at']) as string | undefined;
        const author = (details[index] as unknown as { author?: { name?: string; email?: string } } | null)?.author;
        activities.push({
          id: `content-${item.id}`,
          type: item.status === 'PUBLISHED' ? 'post_published' : 'post_updated',
          user: { name: author?.name ?? '—', email: author?.email ?? '' },
          description: `${item.status === 'PUBLISHED' ? t('activity.published') : t('activity.updated')} "${item.title}"`,
          timestamp: updatedAt ?? new Date().toISOString(),
          url: `/content/edit?id=${item.id}`
        });
      });

      // Usuários recém-cadastros (GET /api/v1/users)
      for (const user of usersRes.data ?? []) {
        activities.push({
          id: `user-${user.id}`,
          type: 'user_registered',
          user: { name: user.name, email: user.email },
          description: t('activity.newUser', { name: user.name }),
          timestamp: user.created_at ?? new Date().toISOString()
        });
      }

      // Ordem cronológica decrescente (o backend não aceita orderBy)
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setActivities(activities.slice(0, 15));
    } catch (e) {
      console.error('Failed to load activity:', e);
    } finally {
      setLoading(false);
    }
  });

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t('activity.justNow');
    if (minutes < 60) return `${minutes} ${t('activity.minAgo')}`;
    if (hours < 24) return `${hours}h ${t('activity.ago')}`;
    if (days < 7) return `${days}d ${t('activity.ago')}`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'post_created': return '📝';
      case 'post_updated': return '✏️';
      case 'post_published': return '🚀';
      case 'media_uploaded': return '📎';
      case 'user_registered': return '👤';
      case 'comment_added': return '💬';
      default: return '📌';
    }
  };

  return (
    <div class="activity-widget" data-widget-panel="activity" style="grid-column: span 2">
      <div class="dashboard-widget-header">
        <h3 class="dashboard-widget-title">{t('dashboard.widgets.activity.title')}</h3>
      </div>
      <div class="dashboard-widget-content">
          {loading() ? (
            <div class="skeleton">Loading...</div>
          ) : (
            <div>
              {activities().length > 0 ? (
                <div class="activity-list">
                  <For each={activities()}>
                    {(activity) => (
                      <a href={activity.url || '#'} class="activity-item" target={activity.url ? '_blank' : ''}>
                        <div class="activity-icon">{getIcon(activity.type)}</div>
                        <div class="activity-content">
                          <p class="activity-description">{activity.description}</p>
                          <p class="activity-meta">
                            <span class="activity-user">{activity.user.name}</span>
                            <span class="activity-time">{formatTime(activity.timestamp)}</span>
                          </p>
                        </div>
                      </a>
                    )}
                  </For>
                </div>
              ) : (
                <p class="empty-state">{t('dashboard.widgets.activity.empty')}</p>
              )}
            </div>
          )}
      </div>

      <div class="styles-container">
        <style>{`
          .activity-list { display: flex; flex-direction: column; gap: 0.5rem; }
          .activity-item {
            display: flex; gap: 0.75rem; padding: 0.75rem;
            background: var(--color-background); border: 1px solid var(--color-border);
            border-radius: var(--radius-md); transition: all 0.15s;
            text-decoration: none; color: inherit;
          }
          .activity-item:hover { border-color: var(--color-primary); background: var(--color-surface); }
          .activity-icon { font-size: 1.25rem; flex-shrink: 0; }
          .activity-content { flex: 1; min-width: 0; }
          .activity-description { font-size: 0.875rem; color: var(--color-text); margin: 0 0 0.25rem; word-break: break-word; }
          .activity-meta { display: flex; gap: 0.75rem; font-size: 0.6875rem; }
          .activity-user { font-weight: 500; color: var(--color-text); }
          .activity-time { color: var(--color-muted); }
        `}</style>
      </div>
    </div>
  );
}