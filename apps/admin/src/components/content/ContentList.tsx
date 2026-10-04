// @oktis-works/admin - Lista de conteúdo (busca, filtros, paginação, publish, ações)
// Migrada para o design-system @oktis-works/ui (Button/Input/Select/Table/Pagination/Badge).

import { Show, createSignal, onMount } from '@oktis-works/ui';
import { Button, Input, Select, Card, Table, Pagination, Badge } from '@oktis-works/ui';
import type { TableColumn } from '@oktis-works/ui';
import { apiClient, type Content, type ContentType } from '../../lib/api';

function raw(row: Content): Record<string, unknown> {
  return row as unknown as Record<string, unknown>;
}

function formatDate(row: Content): string {
  const value = raw(row)['updated_at'] ?? raw(row)['updatedAt'] ?? raw(row)['created_at'];
  if (typeof value !== 'string') return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

export function ContentList() {
  const [items, setItems] = createSignal<Content[]>([]);
  const [types, setTypes] = createSignal<ContentType[]>([]);
  const [total, setTotal] = createSignal(0);
  const [page, setPage] = createSignal(1);
  const [search, setSearch] = createSignal('');
  const [type, setType] = createSignal('');
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
    await load();
    try {
      setTypes(await apiClient.getContentTypes());
    } catch {
      // filtros de tipo continuam com os básicos
    }
  });

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
      setInfo(isPublished ? 'Conteúdo despublicado ✓' : 'Conteúdo publicado ✓');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId('');
    }
  };

  const remove = async (row: Content): Promise<void> => {
    const title = String(raw(row)['title'] ?? row.id);
    if (!confirm(`Excluir "${title}"?`)) return;
    try {
      await apiClient.deleteContent(row.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const columns: TableColumn[] = [
    { key: 'title', label: 'Título' },
    { key: 'type', label: 'Tipo' },
    {
      key: 'status',
      label: 'Status',
      render: (_value, row) => {
        const statusValue = String((row as Record<string, unknown>)['status'] ?? '');
        const variant = statusValue === 'PUBLISHED' ? 'success' : statusValue === 'ARCHIVED' ? 'warning' : 'secondary';
        return <Badge variant={variant}>{statusValue}</Badge>;
      },
    },
    { key: 'updated_at', label: 'Atualizado', render: (_value, row) => <span class="muted">{formatDate(row as Content)}</span> },
    {
      key: 'actions',
      label: '',
      render: (_value, row) => {
        const content = row as Content;
        const isPublished = raw(content)['status'] === 'PUBLISHED';
        return (
          <div class="users-table__actions">
            <a class="btn btn-secondary btn-sm" href={`/content/edit?id=${encodeURIComponent(content.id)}`}>
              Editar
            </a>
            <Button
              variant={isPublished ? 'secondary' : 'primary'}
              size="sm"
              loading={busyId() === content.id}
              onClick={() => void togglePublish(content)}
            >
              {isPublished ? 'Despublicar' : 'Publicar'}
            </Button>
            <Button variant="danger" size="sm" onClick={() => void remove(content)}>
              Excluir
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div class="content-list">
      <Show when={error()}>
        <div class="notice notice--error">{error()}</div>
      </Show>
      <Show when={info()}>
        <div class="notice">{info()}</div>
      </Show>

      <div class="toolbar">
        <Input
          name="search"
          placeholder="Buscar conteúdo…"
          value={search()}
          onInput={(value) => {
            setSearch(value);
            void searchNow();
          }}
        />
        <Select
          name="type"
          placeholder="Todos os tipos"
          value={type()}
          options={types().map((t) => ({ value: t.slug, label: t.pluralLabel || t.name }))}
          onChange={(value) => {
            setType(value);
            void searchNow();
          }}
        />
        <Select
          name="status"
          placeholder="Todos os status"
          value={status()}
          options={[
            { value: 'DRAFT', label: 'Rascunho' },
            { value: 'PUBLISHED', label: 'Publicado' },
            { value: 'ARCHIVED', label: 'Arquivado' },
          ]}
          onChange={(value) => {
            setStatus(value);
            void searchNow();
          }}
        />
        <a class="btn btn-primary" href="/content/new">+ Novo conteúdo</a>
        <Button variant="secondary" onClick={() => void searchNow()}>
          Buscar
        </Button>
      </div>

      <Card>
        <Table
          columns={columns}
          data={items() as unknown[]}
          emptyMessage="Nenhum conteúdo encontrado."
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

