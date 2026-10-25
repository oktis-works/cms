import { For, Show, createSignal, onMount } from 'solid-js';
import { Button, Modal, Pagination } from '@oktis-works/ui';
import { apiClient, type Media } from '../../lib/api';

export type MediaPickerMode = 'image' | 'file' | 'gallery';

interface Props {
  open: boolean;
  mode: MediaPickerMode;
  value?: Media | Media[] | null;
  onClose: () => void;
  onSelect: (media: Media | Media[]) => void;
}

const PAGE_SIZE = 18;

function displayTitle(media: Media): string {
  return media.title?.trim() || media.filename;
}

function extension(media: Media): string {
  return media.filename.split('.').pop()?.toUpperCase() || 'FILE';
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(media: Media): boolean {
  return media.mime_type.startsWith('image/');
}

function dimensions(media: Media): string | null {
  const width = Number(media.metadata?.['width']);
  const height = Number(media.metadata?.['height']);
  return width > 0 && height > 0 ? `${width} × ${height} px` : null;
}

function selectedIds(value: Media | Media[] | null | undefined): string[] {
  return (Array.isArray(value) ? value : value ? [value] : []).map((media) => media.id);
}

export function MediaPickerModal(props: Props) {
  const [items, setItems] = createSignal<Media[]>([]);
  const [total, setTotal] = createSignal(0);
  const [page, setPage] = createSignal(1);
  const [search, setSearch] = createSignal('');
  const [selected, setSelected] = createSignal<Media | null>(null);
  const [selectedItems, setSelectedItems] = createSignal<Media[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal('');
  const [uploading, setUploading] = createSignal(false);
  const [metadataSaving, setMetadataSaving] = createSignal(false);
  const [metadataDirty, setMetadataDirty] = createSignal(false);
  const [titleValue, setTitleValue] = createSignal('');
  const [altValue, setAltValue] = createSignal('');
  const [captionValue, setCaptionValue] = createSignal('');
  const [descriptionValue, setDescriptionValue] = createSignal('');
  let searchInput: HTMLInputElement | undefined;

  const title = (): string => props.mode === 'gallery' ? 'Select images' : props.mode === 'image' ? 'Select an image' : 'Select a file';
  const mimeType = (): string | undefined => props.mode === 'file' ? undefined : 'image/*';
  const mediaUrl = (media: Media): string => apiClient.mediaUrl(media.url);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const result = await apiClient.listMedia({
        page: page(),
        limit: PAGE_SIZE,
        search: search() || undefined,
        mimeType: mimeType(),
      });
      setItems(result.data ?? []);
      setTotal(result.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    const current = Array.isArray(props.value) ? props.value : props.value ? [props.value] : [];
    setSelectedItems(current);
    setSelected(current[0] ?? null);
    setTitleValue(current[0]?.title ?? '');
    setAltValue(current[0]?.alt ?? '');
    setCaptionValue(current[0]?.caption ?? '');
    setDescriptionValue(current[0]?.description ?? '');
    searchInput?.focus();
    void load();
  });

  const choose = (media: Media): void => {
    setSelected(media);
    setTitleValue(media.title ?? '');
    setAltValue(media.alt ?? '');
    setCaptionValue(media.caption ?? '');
    setDescriptionValue(media.description ?? '');
    setMetadataDirty(false);
    if (props.mode === 'gallery') {
      setSelectedItems((current) => current.some((item) => item.id === media.id)
        ? current.filter((item) => item.id !== media.id)
        : [...current, media]);
    } else {
      setSelectedItems([media]);
    }
  };

  const confirm = (): void => {
    if (metadataDirty()) {
      setError('Save media details before selecting this attachment.');
      return;
    }
    if (props.mode === 'gallery') {
      if (selectedItems().length > 0) props.onSelect(selectedItems());
      return;
    }
    const media = selected();
    if (media) props.onSelect(media);
  };

  const saveMetadata = async (): Promise<void> => {
    const media = selected();
    if (!media) return;
    setMetadataSaving(true);
    setError('');
    try {
      const updated = await apiClient.updateMedia(media.id, {
        title: titleValue(),
        alt: altValue(),
        caption: captionValue(),
        description: descriptionValue(),
      });
      setSelected(updated);
      setSelectedItems((current) => current.map((item) => item.id === updated.id ? updated : item));
      setMetadataDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMetadataSaving(false);
    }
  };

  const moveSelected = (index: number, offset: number): void => {
    const nextIndex = index + offset;
    const current = [...selectedItems()];
    if (nextIndex < 0 || nextIndex >= current.length) return;
    const currentItem = current[index];
    const nextItem = current[nextIndex];
    if (!currentItem || !nextItem) return;
    current[index] = nextItem;
    current[nextIndex] = currentItem;
    setSelectedItems(current);
  };

  const searchNow = async (): Promise<void> => {
    setPage(1);
    await load();
  };

  const upload = async (file: File): Promise<void> => {
    if (props.mode !== 'file' && !file.type.startsWith('image/')) {
      setError('Only image files can be selected in this field.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const media = await apiClient.uploadMedia(file);
      choose(media);
      setSelectedItems(props.mode === 'gallery' ? [...selectedItems(), media] : [media]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal open={props.open} title={title()} onClose={props.onClose}>
      <div class="media-picker-modal">
        <div class="media-picker-modal__toolbar">
          <input
            ref={searchInput}
            class="input media-picker-modal__search"
            type="search"
            name="media-search"
            aria-label="Search media"
            placeholder="Search by filename or alt text"
            value={search()}
            onInput={(event) => setSearch(event.currentTarget.value)}
          />
          <Button variant="secondary" onClick={() => void searchNow()}>Search</Button>
          <label class="btn btn-secondary" classList={{ 'btn-loading': uploading() }}>
            {uploading() ? 'Uploading…' : 'Upload'}
            <input
              type="file"
              accept={props.mode === 'file' ? undefined : 'image/*'}
              disabled={uploading()}
              hidden
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void upload(file);
                event.currentTarget.value = '';
              }}
            />
          </label>
        </div>

        <Show when={error()}>
          <div class="notice notice--error media-picker-modal__error">
            <span>{error()}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>Retry</Button>
          </div>
        </Show>
        <Show when={loading()}><p class="muted">Loading media…</p></Show>
        <Show when={!loading() && items().length === 0}><p class="muted">No media found.</p></Show>

        <div class="media-picker-modal__body">
          <div>
            <div class="media-picker-modal__grid">
              <For each={items()}>
                {(media) => (
                  <button
                    type="button"
                    classList={{
                      'media-card': true,
                      'media-card--selected': selectedIds(selectedItems()).includes(media.id),
                    }}
                    onClick={() => choose(media)}
                  >
                    <div class="media-card__preview">
                      <Show when={isImage(media)} fallback={<span class="media-card__ext">{extension(media)}</span>}>
                        <img src={mediaUrl(media)} alt={media.alt ?? displayTitle(media)} loading="lazy" />
                      </Show>
                    </div>
                    <span class="media-card__name" title={displayTitle(media)}>{displayTitle(media)}</span>
                  </button>
                )}
              </For>
            </div>

            <Show when={props.mode === 'gallery' && selectedItems().length > 0}>
              <div class="media-picker-modal__order" aria-label="Selected image order">
                <strong>Gallery order</strong>
                <For each={selectedItems()}>
                  {(media, index) => (
                    <div class="media-picker-modal__order-item">
                      <span>{index() + 1}. {displayTitle(media)}</span>
                      <Button variant="ghost" size="sm" disabled={index() === 0} onClick={() => moveSelected(index(), -1)}>↑</Button>
                      <Button variant="ghost" size="sm" disabled={index() === selectedItems().length - 1} onClick={() => moveSelected(index(), 1)}>↓</Button>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>

          <Show when={selected()} fallback={<p class="muted media-picker-modal__empty-details">Click an item to inspect its details.</p>}>
            {(media) => (
              <aside class="media-picker-modal__details">
                <div class="media-modal__preview">
                  <Show when={isImage(media())} fallback={<span class="media-card__ext media-modal__file-icon">{extension(media())}</span>}>
                    <img src={mediaUrl(media())} alt={media().alt ?? displayTitle(media())} />
                  </Show>
                </div>
                <h4>{displayTitle(media())}</h4>
                <dl class="media-details__list">
                  <dt>Filename</dt><dd>{media().filename}</dd>
                  <dt>Extension</dt><dd>{extension(media())}</dd>
                  <dt>MIME type</dt><dd>{media().mime_type}</dd>
                  <dt>Size</dt><dd>{formatSize(media().size)}</dd>
                  <Show when={dimensions(media())}><dt>Dimensions</dt><dd>{dimensions(media())}</dd></Show>
                  <dt>URL</dt><dd><code>{mediaUrl(media())}</code></dd>
                  <dt>Uploaded</dt><dd>{media().created_at ? new Date(media().created_at as string).toLocaleString() : '—'}</dd>
                  <dt>Title</dt><dd><input class="input" value={titleValue()} onInput={(event) => { setTitleValue(event.currentTarget.value); setMetadataDirty(true); }} /></dd>
                  <dt>Alt text</dt><dd><input class="input" value={altValue()} onInput={(event) => { setAltValue(event.currentTarget.value); setMetadataDirty(true); }} /></dd>
                  <dt>Caption</dt><dd><textarea class="input" rows={2} value={captionValue()} onInput={(event) => { setCaptionValue(event.currentTarget.value); setMetadataDirty(true); }} /></dd>
                  <dt>Description</dt><dd><textarea class="input" rows={3} value={descriptionValue()} onInput={(event) => { setDescriptionValue(event.currentTarget.value); setMetadataDirty(true); }} /></dd>
                  <Show when={media().metadata && Object.keys(media().metadata ?? {}).length > 0}>
                    <dt>Metadata</dt><dd><code>{JSON.stringify(media().metadata)}</code></dd>
                  </Show>
                </dl>
                <Show when={metadataDirty()}>
                  <Button variant="secondary" disabled={metadataSaving()} onClick={() => void saveMetadata()}>
                    {metadataSaving() ? 'Saving…' : 'Save media details'}
                  </Button>
                </Show>
              </aside>
            )}
          </Show>
        </div>

        <Pagination page={page()} limit={PAGE_SIZE} total={total()} onPageChange={(next) => { setPage(next); void load(); }} />
        <div class="media-picker-modal__actions">
          <span class="muted">{metadataDirty() ? 'Unsaved media details' : props.mode === 'gallery' ? `${selectedItems().length} image(s) selected` : selected() ? '1 item selected' : 'No item selected'}</span>
          <div>
            <Button variant="secondary" onClick={props.onClose}>Cancel</Button>
            <Button variant="primary" disabled={props.mode === 'gallery' ? selectedItems().length === 0 : !selected()} onClick={confirm}>Select</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
