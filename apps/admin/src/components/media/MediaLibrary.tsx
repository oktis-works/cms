// @oktis-works/admin - Media Library (grid + upload real + edição de alt/caption)

import { For, Show, createSignal, onMount } from 'solid-js';
import { apiClient, type Media } from '../../lib/api';

interface Props {
  /** /media/upload abre a página já com a zona de upload em destaque */
  focusUpload?: boolean;
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const isImage = (media: Media): boolean => media.mime_type.startsWith('image/');

export function MediaLibrary(props: Props) {
  const [items, setItems] = createSignal<Media[]>([]);
  const [total, setTotal] = createSignal(0);
  const [page, setPage] = createSignal(1);
  const [search, setSearch] = createSignal('');
  const [mimeType, setMimeType] = createSignal('');
  const [error, setError] = createSignal('');
  const [info, setInfo] = createSignal('');
  const [uploading, setUploading] = createSignal(false);
  const [selected, setSelected] = createSignal<Media | null>(null);
  const [dragOver, setDragOver] = createSignal(false);
  const [savingDetails, setSavingDetails] = createSignal(false);

  const limit = 24;

  const load = async (): Promise<void> => {
    try {
      const result = await apiClient.listMedia({
        page: page(),
        limit,
        search: search() || undefined,
        mimeType: mimeType() || undefined,
      });
      setItems(result.data ?? []);
      setTotal(result.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  onMount(load);

  const totalPages = (): number => Math.max(1, Math.ceil(total() / limit));

  const searchNow = async (): Promise<void> => {
    setPage(1);
    await load();
  };

  const doUpload = async (files: FileList | File[]): Promise<void> => {
    if (files.length === 0) return;
    setUploading(true);
    setError('');
    setInfo('');

    let ok = 0;
    for (const file of Array.from(files)) {
      try {
        await apiClient.uploadMedia(file, { alt: '' });
        ok += 1;
      } catch (err) {
        setError(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    setUploading(false);
    if (ok > 0) {
      setInfo(`${ok} arquivo${ok > 1 ? 's' : ''} enviado${ok > 1 ? 's' : ''} ✓`);
      setPage(1);
      await load();
    }
  };

  const remove = async (media: Media): Promise<void> => {
    if (!confirm(`Excluir "${media.filename}"? O arquivo será removido do disco.`)) return;
    try {
      await apiClient.deleteMedia(media.id);
      if (selected()?.id === media.id) setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const saveDetails = async (): Promise<void> => {
    const media = selected();
    if (!media) return;
    setSavingDetails(true);
    setError('');
    try {
      const updated = await apiClient.updateMedia(media.id, {
        alt: media.alt ?? '',
        caption: media.caption ?? '',
      });
      setSelected({ ...media, ...updated });
      setInfo('Detalhes salvos ✓');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingDetails(false);
    }
  };

  const copyUrl = async (url: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
      setInfo('URL copiada ✓');
    } catch {
      setError('Não foi possível copiar a URL');
    }
  };

  return (
    <div class="media-library">
      <Show when={error()}>
        <div class="notice notice--error">{error()}</div>
      </Show>
      <Show when={info()}>
        <div class="notice">{info()}</div>
      </Show>

      <div
        classList={{
          'upload-zone': true,
          'upload-zone--active': dragOver() || props.focusUpload,
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer) void doUpload(e.dataTransfer.files);
        }}
      >
        <p>
          <strong>Arraste arquivos aqui</strong> ou
        </p>
        <label class="btn btn-primary" style={{ cursor: 'pointer' }}>
          {uploading() ? 'Enviando…' : 'Selecionar arquivos'}
          <input
            type="file"
            multiple
            style={{ display: 'none' }}
            disabled={uploading()}
            onChange={(e) => {
              if (e.currentTarget.files) void doUpload(e.currentTarget.files);
              e.currentTarget.value = '';
            }}
          />
        </label>
        <p class="muted">Imagens, vídeos, áudios e documentos · até 25MB por arquivo</p>
      </div>

      <div class="toolbar">
        <input
          class="input"
          placeholder="Buscar por nome ou alt…"
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && void searchNow()}
        />
        <select
          class="input"
          value={mimeType()}
          onChange={(e) => {
            setMimeType(e.currentTarget.value);
            void searchNow();
          }}
        >
          <option value="">Todos os tipos</option>
          <option value="image/png">PNG</option>
          <option value="image/jpeg">JPEG</option>
          <option value="image/gif">GIF</option>
          <option value="image/webp">WebP</option>
          <option value="image/svg+xml">SVG</option>
          <option value="application/pdf">PDF</option>
          <option value="video/mp4">MP4</option>
          <option value="audio/mpeg">MP3</option>
        </select>
        <button class="btn btn-secondary" type="button" onClick={() => void searchNow()}>
          Buscar
        </button>
      </div>

      <Show
        when={items().length > 0}
        fallback={<p class="muted">Nenhum arquivo ainda. Envie o primeiro!</p>}
      >
        <div class="media-grid">
          <For each={items()}>
            {(media) => (
              <button
                type="button"
                classList={{
                  'media-card': true,
                  'media-card--selected': selected()?.id === media.id,
                }}
                onClick={() => setSelected(media)}
              >
                <div class="media-card__preview">
                  <Show when={isImage(media)} fallback={<span class="media-card__ext">{media.mime_type.split('/')[1]?.toUpperCase() ?? 'FILE'}</span>}>
                    <img src={media.url} alt={media.alt ?? media.filename} loading="lazy" />
                  </Show>
                </div>
                <div class="media-card__meta">
                  <span class="media-card__name" title={media.filename}>{media.filename}</span>
                  <span class="muted">{formatSize(media.size)}</span>
                </div>
              </button>
            )}
          </For>
        </div>
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

      <Show when={selected()}>
        {(media) => (
          <div class="card media-details">
            <h3>Detalhes</h3>
            <div class="media-details__preview">
              <Show when={isImage(media())} fallback={<p class="muted">{media().mime_type}</p>}>
                <img src={media().url} alt={media().alt ?? ''} />
              </Show>
            </div>
            <dl class="media-details__list">
              <dt>Arquivo</dt><dd>{media().filename}</dd>
              <dt>Tipo</dt><dd>{media().mime_type}</dd>
              <dt>Tamanho</dt><dd>{formatSize(media().size)}</dd>
              <dt>URL</dt>
              <dd class="media-details__url">
                <code>{media().url}</code>
                <button class="btn btn-secondary btn-sm" type="button" onClick={() => void copyUrl(media().url)}>Copiar</button>
              </dd>
            </dl>
            <label>
              Texto alternativo (alt)
              <input
                class="input"
                value={media().alt ?? ''}
                onInput={(e) => setSelected({ ...media(), alt: e.currentTarget.value })}
              />
            </label>
            <label>
              Legenda
              <input
                class="input"
                value={media().caption ?? ''}
                onInput={(e) => setSelected({ ...media(), caption: e.currentTarget.value })}
              />
            </label>
            <div class="media-details__actions">
              <button class="btn btn-primary" type="button" disabled={savingDetails()} onClick={() => void saveDetails()}>
                {savingDetails() ? 'Salvando…' : 'Salvar detalhes'}
              </button>
              <button class="btn btn-danger" type="button" onClick={() => void remove(media())}>
                Excluir
              </button>
              <button class="btn btn-secondary" type="button" onClick={() => setSelected(null)}>
                Fechar
              </button>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
