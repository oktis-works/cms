// @oktis-works/admin - Lista de conteúdo (busca, filtros, paginação, publish, ações)
// Migrada para o design-system @oktis-works/ui (Button/Input/Select/Table/Pagination/Badge).

import { Show, createMemo, createSignal, onMount } from 'solid-js';
import { Button, Input, Select, Card, Table, Pagination, Badge } from '@oktis-works/ui';
import type { TableColumn } from '@oktis-works/ui';
import { apiClient, type Content, type ContentType } from '../../lib/api';
import { useTranslation } from '../../i18n';

function raw(row: Content): Record<string, unknown> {
  return row as unknown as Record<string, unknown>;
}

function formatDate(row: Content): string {
  const value = raw(row)['updated_at'] ?? raw(row)['updatedAt'] ?? raw(row)['created_at'];
  if (typeof value !== 'string') return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

export function ContentList(props: { contentType: string }) {
  const { t } = useTranslation();
  const [items, setItems] = createSignal<Content[]>([]);
  const [types, setTypes] = createSignal<ContentType[]>([]);
  const [total, setTotal] = createSignal(0);
  const [page, setPage] = createSignal(1);
  const [search, setSearch] = createSignal('');
  const [type] = createSignal(props.contentType);
  const [status, setStatus] = createSignal('');
  const [error, setError] = createSignal('');
  const [info, setInfo] = createSignal('');
  const [busyId, setBusyId] = createSignal('');

  const limit = 20;

  const load = async (): Promise<void> => {
    try {
      const result = await apiClient.getContent({
        page: page(),
        limit,
        type: type() || undefined,
        status: status() || undefined,
        search: search() || undefined,
      });
      setItems(result.data ?? []);
      setTotal(result.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  onMount(async () => {
    const query = new URLSearchParams(window.location.search);
    setStatus(query.get('status') ?? '');
    setSearch(query.get('search') ?? '');
    await load();
    try {
      setTypes(await apiClient.getContentTypes());
    } catch {
      // filtros de tipo continuam com os básicos
    }
  });

  const activeType = createMemo(() => types().find((entry) => entry.slug === type()));
  const pageTitle = createMemo(() => activeType()?.pluralLabel || t('content.list.title'));
  const newContentHref = createMemo(() => `/content/${encodeURIComponent(type())}/new`);

  const searchNow = async (): Promise<void> => {
    setPage(1);
    await load();
  };

  const togglePublish = async (row: Content): Promise<void> => {
    const isPublished = raw(row)['status'] === 'PUBLISHED';
    setBusyId(row.id);
    setError('');
    setInfo('');
    try {
      await apiClient.publishToggle(row.id, isPublished);
      setInfo(t(isPublished ? 'content.list.toasts.unpublished' : 'content.list.toasts.published'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId('');
    }
  };

  const remove = async (row: Content): Promise<void> => {
    const title = String(raw(row)['title'] ?? row.id);
    if (!confirm(t('content.list.confirmDelete', { title }))) return;
    try {
      await apiClient.deleteContent(row.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const columns = createMemo<TableColumn[]>(() => [
    { key: 'title', label: t('content.list.columns.title') },
    { key: 'type', label: t('content.list.columns.type') },
    {
      key: 'status',
      label: t('content.list.columns.status'),
      render: (_value, row) => {
        const statusValue = String((row as Record<string, unknown>)['status'] ?? '');
        const variant = statusValue === 'PUBLISHED' ? 'success' : statusValue === 'ARCHIVED' ? 'warning' : 'secondary';
        return <Badge variant={variant}>{statusValue}</Badge>;
      },
    },
    { key: 'updated_at', label: t('content.list.columns.updated'), render: (_value, row) => <span class="muted">{formatDate(row as Content)}</span> },
    {
      key: 'actions',
      label: '',
      render: (_value, row) => {
        const content = row as Content;
        const isPublished = raw(content)['status'] === 'PUBLISHED';
        return (
          <div class="users-table__actions">
            <a class="btn btn-secondary btn-sm" href={`/content/${encodeURIComponent(content.type || type())}/edit?id=${encodeURIComponent(content.id)}`}>
              {t('content.list.actions.edit')}
            </a>
            <Button
              variant={isPublished ? 'secondary' : 'primary'}
              size="sm"
              loading={busyId() === content.id}
              onClick={() => void togglePublish(content)}
            >
              {isPublished ? t('content.list.actions.unpublish') : t('content.list.actions.publish')}
            </Button>
            <Button variant="danger" size="sm" onClick={() => void remove(content)}>
              {t('content.list.actions.delete')}
            </Button>
          </div>
        );
      },
    },
  ]);

  return (
    <div class="content-list">
      <div class="content-list__heading">
        <div>
          <h2>{pageTitle()}</h2>
          <p class="muted">{t('content.list.description')}</p>
        </div>
        <a class="btn btn-primary" href={newContentHref()}>{t('content.list.buttons.addNew')}</a>
      </div>
      <Show when={error()}>
        <div class="notice notice--error">{error()}</div>
      </Show>
      <Show when={info()}>
        <div class="notice">{info()}</div>
      </Show>

      <div class="toolbar">
        <Input
          name="search"
          placeholder={t('content.list.filters.search')}
          value={search()}
          onInput={(value) => {
            setSearch(value);
            void searchNow();
          }}
        />
        <Select
          name="status"
          placeholder={t('content.list.filters.allStatus')}
          value={status()}
          options={[
            { value: 'DRAFT', label: t('content.list.statuses.draft') },
            { value: 'PUBLISHED', label: t('content.list.statuses.published') },
            { value: 'ARCHIVED', label: t('content.list.statuses.archived') },
          ]}
          onChange={(value) => {
            setStatus(value);
            void searchNow();
          }}
        />
        <Button variant="secondary" onClick={() => void searchNow()}>
          {t('content.list.buttons.search')}
        </Button>
      </div>

      <Card>
        <Table
          columns={columns()}
          data={items() as unknown[]}
          emptyMessage={t('content.list.empty')}
        />
        <Pagination
          page={page()}
          limit={limit}
          total={total()}
          onPageChange={(next) => {
            setPage(next);
            void load();
          }}
        />
      </Card>
    </div>
  );
}
