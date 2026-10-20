// @oktis-works/admin - Comments moderation screen (Item 11)

import { For, Show, createSignal, onMount } from 'solid-js';
import { apiClient, type CommentInfo, type CommentStatus } from '../../../lib/api';
import { useTranslation } from '../../../i18n';

const TABS: CommentStatus[] = ['PENDING', 'APPROVED', 'SPAM', 'TRASHED'];

export function CommentsManager() {
  const { t } = useTranslation();
  const [comments, setComments] = createSignal<CommentInfo[]>([]);
  const [counts, setCounts] = createSignal<Record<string, number>>({});
  const [tab, setTab] = createSignal<CommentStatus>('PENDING');
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal('');
  const [busyId, setBusyId] = createSignal<string | null>(null);

  const load = async (): Promise<void> => {
    setError('');
    try {
      setLoading(true);
      const page = await apiClient.getComments({ status: tab(), limit: 100 });
      setComments(page.comments ?? []);
      setCounts(page.counts ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  onMount(load);

  const changeTab = async (status: CommentStatus): Promise<void> => {
    setTab(status);
    await load();
  };

  const setStatus = async (comment: CommentInfo, status: CommentStatus): Promise<void> => {
    setError('');
    setBusyId(comment.id);
    try {
      await apiClient.updateComment(comment.id, { status });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (comment: CommentInfo): Promise<void> => {
    if (!confirm(t('comments.confirmDelete'))) return;
    setError('');
    setBusyId(comment.id);
    try {
      await apiClient.deleteComment(comment.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const authorName = (comment: CommentInfo): string => comment.authorName ?? comment.author_name ?? '—';
  const createdAt = (comment: CommentInfo): string => comment.createdAt ?? comment.created_at ?? '';

  const statusLabel = (status: string): string => t(`comments.status.${status.toLowerCase()}`);

  return (
    <div class="comments-manager">
      <Show when={error()}><div class="notice notice--error">{error()}</div></Show>

      <div class="comments-tabs" role="tablist">
        <For each={TABS}>
          {(status) => (
            <button
              type="button"
              class="comments-tab"
              classList={{ active: tab() === status }}
              onClick={() => void changeTab(status)}
            >
              {statusLabel(status)}
              <span class="comments-count">{counts()[status] ?? 0}</span>
            </button>
          )}
        </For>
        <button type="button" class="btn btn-secondary btn-sm comments-reload" onClick={() => void load()} disabled={loading()}>
          {t('comments.reload')}
        </button>
      </div>

      <Show when={!loading()} fallback={<div class="skeleton">{t('comments.loading')}</div>}>
        <Show
          when={comments().length > 0}
          fallback={<div class="empty-state">{t('comments.empty')}</div>}
        >
          <div class="card">
            <table class="table">
              <thead>
                <tr>
                  <th>{t('comments.author')}</th>
                  <th>{t('comments.comment')}</th>
                  <th>{t('comments.inReplyTo')}</th>
                  <th>{t('comments.submitted')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <For each={comments()}>
                  {(comment) => (
                    <tr data-comment-status={comment.status}>
                      <td class="comments-author">
                        <strong>{authorName(comment)}</strong>
                        <Show when={comment.authorEmail}>
                          <span class="muted comments-email">{comment.authorEmail}</span>
                        </Show>
                      </td>
                      <td class="comments-body">{comment.body}</td>
                      <td class="muted">{comment.contentId ?? comment.content_id ?? '—'}</td>
                      <td class="muted">{createdAt(comment)}</td>
                      <td class="comments-actions">
                        <Show when={comment.status !== 'APPROVED'}>
                          <button
                            type="button"
                            class="btn btn-primary btn-sm"
                            disabled={busyId() === comment.id}
                            onClick={() => void setStatus(comment, 'APPROVED')}
                          >
                            {t('comments.approve')}
                          </button>
                        </Show>
                        <Show when={comment.status !== 'SPAM'}>
                          <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            disabled={busyId() === comment.id}
                            onClick={() => void setStatus(comment, 'SPAM')}
                          >
                            {t('comments.spam')}
                          </button>
                        </Show>
                        <Show when={comment.status !== 'TRASHED'}>
                          <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            disabled={busyId() === comment.id}
                            onClick={() => void setStatus(comment, 'TRASHED')}
                          >
                            {t('comments.trash')}
                          </button>
                        </Show>
                        <button
                          type="button"
                          class="btn btn-danger btn-sm"
                          disabled={busyId() === comment.id}
                          onClick={() => void remove(comment)}
                        >
                          {t('comments.delete')}
                        </button>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>

      <style>{`
        .comments-tabs { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
        .comments-tab {
          display: inline-flex; align-items: center; gap: 0.4rem;
          padding: 0.4rem 0.8rem; border: 1px solid var(--color-border);
          border-radius: var(--radius-full); background: transparent;
          color: var(--color-text); cursor: pointer; font-size: 0.8125rem;
        }
        .comments-tab.active { border-color: var(--color-primary); color: var(--color-primary); font-weight: 600; }
        .comments-count {
          background: var(--color-muted-soft); color: var(--color-muted);
          border-radius: var(--radius-full); padding: 0 0.45rem; font-size: 0.6875rem;
        }
        .comments-reload { margin-left: auto; }
        .comments-author { display: flex; flex-direction: column; gap: 0.15rem; }
        .comments-email { font-size: 0.75rem; }
        .comments-body { max-width: 28rem; }
        .comments-actions { display: flex; gap: 0.35rem; flex-wrap: wrap; }
        .empty-state { padding: 3rem; text-align: center; color: var(--color-muted); }
        .skeleton { padding: 2rem; text-align: center; color: var(--color-muted); }
      `}</style>
    </div>
  );
}
