import { createSignal, onMount, For } from 'solid-js';
import { useTranslation } from '../../i18n';
import { apiClient } from '../../lib/api';
import { DashboardWidget } from './AtGlanceWidget';

interface QuickDraftPost {
  id: string;
  title: string;
  excerpt?: string;
  status: string;
  /** Pode faltar no tipo `Content` do cliente — o backend envia snake_case */
  updated_at?: string;
  slug: string;
}

export function QuickDraftWidget() {
  const { t } = useTranslation();
  const [drafts, setDrafts] = createSignal<QuickDraftPost[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [newTitle, setNewTitle] = createSignal('');
  const [newContent, setNewContent] = createSignal('');

  onMount(async () => {
    try {
      // Backend: GET /api/v1/content?status=DRAFT (ordenado por created_at DESC)
      const result = await apiClient.getContent({
        type: 'post',
        status: 'DRAFT',
        limit: 5
      });
      setDrafts(result.data ?? []);
    } catch (e) {
      console.error('Failed to load drafts:', e);
    } finally {
      setLoading(false);
    }
  });

  const handleSave = async (e: Event) => {
    e.preventDefault();
    if (!newTitle().trim()) return;

    setSaving(true);
    try {
      const post = await apiClient.createContent({
        type: 'post',
        title: newTitle(),
        slug: newTitle().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        excerpt: newContent(),
        status: 'DRAFT',
        body: { content: newContent() }
      });
      setDrafts([post, ...drafts()]);
      setNewTitle('');
      setNewContent('');
    } catch (e) {
      console.error('Failed to save draft:', e);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <DashboardWidget title={t('dashboard.widgets.quickDraft.title')} panelId="quick-draft">
      <div class="quick-draft-wrapper">
        <div class="quick-draft-content-wrapper">
          {loading() ? (
            <div class="skeleton">Loading...</div>
          ) : (
            <div class="quick-draft-content">
              <form onSubmit={handleSave} class="quick-draft-form">
                <div class="form-group">
                  <label for="quick-draft-title">{t('dashboard.widgets.quickDraft.heading')}</label>
                  <input
                    type="text"
                    id="quick-draft-title"
                    class="input"
                    value={newTitle()}
                    onInput={(e) => setNewTitle(e.currentTarget.value)}
                    placeholder={t('dashboard.widgets.quickDraft.headingPlaceholder')}
                    required
                  />
                </div>

                <div class="form-group">
                  <label for="quick-draft-content">{t('dashboard.widgets.quickDraft.content')}</label>
                  <textarea
                    id="quick-draft-content"
                    class="input"
                    rows={4}
                    value={newContent()}
                    onInput={(e) => setNewContent(e.currentTarget.value)}
                    placeholder={t('dashboard.widgets.quickDraft.contentPlaceholder')}
                  />
                </div>

                <div class="form-actions">
                  <button type="submit" class="btn btn-primary" disabled={saving()}>
                    {saving() ? <span class="spinner"></span> : t('dashboard.widgets.quickDraft.save')}
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary"
                    onClick={() => { setNewTitle(''); setNewContent(''); }}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </form>

              <div class="drafts-section">
                {drafts().length > 0 ? (
                  <div class="drafts-list">
                    <h4>{t('dashboard.widgets.quickDraft.yourDrafts')}</h4>
                    <For each={drafts()}>
                      {(draft) => (
                        <a href={`/content/edit?id=${draft.id}`} class="draft-item">
                          <div class="draft-info">
                            <span class="draft-title">{draft.title}</span>
                            <span class="draft-meta">
                              <span class="status-draft">{t('content.list.statuses.draft')}</span>
                              <span class="draft-date">{formatDate(draft.updated_at)}</span>
                            </span>
                          </div>
                        </a>
                      )}
                    </For>
                  </div>
                ) : (
                  <p class="empty-state">{t('dashboard.widgets.quickDraft.noDrafts')}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .quick-draft-form { display: flex; flex-direction: column; gap: 1rem; }
        .form-group textarea { min-height: 100px; resize: vertical; font-family: inherit; }
        .drafts-list h4 { margin-bottom: 1rem; }
        .draft-item {
          display: flex; flex-direction: column; gap: 0.5rem;
          padding: 0.75rem; background: var(--color-surface);
          border: 1px solid var(--color-border); border-radius: var(--radius-md);
          text-decoration: none; color: inherit; transition: all 0.15s ease;
        }
        .draft-item:hover { border-color: var(--color-primary); background: var(--color-surface-hover); }
        .draft-info { display: flex; flex-direction: column; gap: 0.25rem; }
        .draft-title { font-weight: 600; color: var(--color-text); }
        .draft-meta { display: flex; gap: 0.5rem; font-size: 0.8125rem; color: var(--color-muted); }
        .status-draft { color: var(--color-warning); font-weight: 500; }
        .draft-date { font-size: 0.75rem; }
      `}</style>
    </DashboardWidget>
  );
}
