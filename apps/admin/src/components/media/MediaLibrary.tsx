// @oktis-works/admin - Media Library (grid + upload real + edição de alt/caption)
// Migrada para o design-system @oktis-works/ui (Button/Input/Select/Pagination).

import { For, Show, createSignal, onMount } from '@oktis-works/ui';
import { Button, Input, Select, Pagination } from '@oktis-works/ui';
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
        <Input
          name="media-search"
          placeholder="Buscar por nome ou alt…"
          value={search()}
          onInput={(value) => {
            setSearch(value);
            void searchNow();
          }}
        />
        <Select
          name="media-mime"
          placeholder="Todos os tipos"
          value={mimeType()}
          options={[
            { value: 'image/png', label: 'PNG' },
            { value: 'image/jpeg', label: 'JPEG' },
            { value: 'image/gif', label: 'GIF' },
            { value: 'image/webp', label: 'WebP' },
            { value: 'image/svg+xml', label: 'SVG' },
            { value: 'application/pdf', label: 'PDF' },
            { value: 'video/mp4', label: 'MP4' },
            { value: 'audio/mpeg', label: 'MP3' },
          ]}
          onChange={(value) => {
            setMimeType(value);
            void searchNow();
          }}
        />
        <Button variant="secondary" onClick={() => void searchNow()}>
          Buscar
        </Button>
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

      <Pagination
        page={page()}
        limit={limit}
        total={total()}
        onPageChange={(next) => {
          setPage(next);
          void load();
        }}
      />

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
            <Input
              name="media-alt"
              label="Texto alternativo (alt)"
              value={media().alt ?? ''}
              onInput={(value) => setSelected({ ...media(), alt: value })}
            />
            <Input
              name="media-caption"
              label="Legenda"
              value={media().caption ?? ''}
              onInput={(value) => setSelected({ ...media(), caption: value })}
            />
            <div class="media-details__actions">
              <Button variant="primary" disabled={savingDetails()} loading={savingDetails()} onClick={() => void saveDetails()}>
                Salvar detalhes
              </Button>
              <Button variant="danger" onClick={() => void remove(media())}>
                Excluir
              </Button>
              <Button variant="secondary" onClick={() => setSelected(null)}>
                Fechar
              </Button>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
