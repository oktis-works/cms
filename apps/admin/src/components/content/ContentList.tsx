// @oktis-works/admin - Lista de conteúdo (busca, filtros, paginação, ações)

import { For, Show, createSignal, onMount } from 'solid-js';
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

  const totalPages = (): number => Math.max(1, Math.ceil(total() / limit));

  const searchNow = async (): Promise<void> => {
    setPage(1);
    await load();
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

  return (
    <div class="content-list">
      <Show when={error()}>
        <div class="notice notice--error">{error()}</div>
      </Show>

      <div class="toolbar">
        <input
          class="input"
          placeholder="Buscar conteúdo…"
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && void searchNow()}
        />
        <select
          class="input"
          value={type()}
          onChange={(e) => {
            setType(e.currentTarget.value);
            void searchNow();
          }}
        >
          <option value="">Todos os tipos</option>
          <For each={types()}>{(t) => <option value={t.slug}>{t.pluralLabel || t.name}</option>}</For>
        </select>
        <select
          class="input"
          value={status()}
          onChange={(e) => {
            setStatus(e.currentTarget.value);
            void searchNow();
          }}
        >
          <option value="">Todos os status</option>
          <option value="DRAFT">Rascunho</option>
          <option value="PUBLISHED">Publicado</option>
          <option value="ARCHIVED">Arquivado</option>
        </select>
        <a class="btn btn-primary" href="/content/new">+ Novo conteúdo</a>
        <button class="btn btn-secondary" type="button" onClick={() => void searchNow()}>
          Buscar
        </button>
      </div>

      <div class="card">
        <Show when={items().length > 0} fallback={<p class="muted">Nenhum conteúdo encontrado.</p>}>
          <table class="table">
            <thead>
              <tr>
                <th>Título</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>Atualizado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <For each={items()}>
                {(row) => (
                  <tr>
                    <td>{String(raw(row)['title'] ?? '—')}</td>
                    <td>{String(raw(row)['type'] ?? '—')}</td>
                    <td>{String(raw(row)['status'] ?? '—')}</td>
                    <td class="muted">{formatDate(row)}</td>
                    <td class="users-table__actions">
                      <a class="btn btn-secondary btn-sm" href={`/content/edit?id=${encodeURIComponent(row.id)}`}>
                        Editar
                      </a>
                      <button class="btn btn-danger btn-sm" type="button" onClick={() => void remove(row)}>
                        Excluir
                      </button>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>

        <Show when={totalPages() > 1}>
          <div class="pagination">
            <button class="btn btn-secondary btn-sm" type="button" disabled={page() <= 1} onClick={() => { setPage(page() - 1); void load(); }}>
              ← Anterior
            </button>
            <span class="muted">Página {page()} de {totalPages()}</span>
            <button class="btn btn-secondary btn-sm" type="button" disabled={page() >= totalPages()} onClick={() => { setPage(page() + 1); void load(); }}>
              Próxima →
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
}
