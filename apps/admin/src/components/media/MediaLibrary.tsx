// @oktis-works/admin - Media Library (WordPress-style attachment modal)

import { For, Show, createSignal, onMount } from '@oktis-works/ui';
import { Button, Input, Modal, Pagination, Select } from '@oktis-works/ui';
import { apiClient, type Media } from '../../lib/api';
import { useTranslation } from '../../i18n';

interface Props {
  /** /media/upload abre a página já com a zona de upload em destaque */
  focusUpload?: boolean;
}

interface MediaDraft {
  title: string;
  alt: string;
  caption: string;
  description: string;
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(media: Media): boolean { return media.mime_type.startsWith('image/'); }
function isVideo(media: Media): boolean { return media.mime_type.startsWith('video/'); }
function isAudio(media: Media): boolean { return media.mime_type.startsWith('audio/'); }
function isPdf(media: Media): boolean { return media.mime_type === 'application/pdf'; }
function displayTitle(media: Media): string { return media.title?.trim() || media.filename; }
function dimensions(media: Media): string | null {
  const metadata = media.metadata;
  const width = Number(metadata?.['width']);
  const height = Number(metadata?.['height']);
  return width > 0 && height > 0 ? `${width} × ${height} px` : null;
}

function draftFrom(media: Media): MediaDraft {
  return {
    title: media.title ?? media.filename,
    alt: media.alt ?? '',
    caption: media.caption ?? '',
    description: media.description ?? '',
  };
}

export function MediaLibrary(props: Props) {
  const { t } = useTranslation();
  const [items, setItems] = createSignal<Media[]>([]);
  const [total, setTotal] = createSignal(0);
  const [page, setPage] = createSignal(1);
  const [search, setSearch] = createSignal('');
  const [mimeType, setMimeType] = createSignal('');
  const [error, setError] = createSignal('');
  const [info, setInfo] = createSignal('');
  const [uploading, setUploading] = createSignal(false);
  const [selected, setSelected] = createSignal<Media | null>(null);
  const [draft, setDraft] = createSignal<MediaDraft>({ title: '', alt: '', caption: '', description: '' });
  const [dragOver, setDragOver] = createSignal(false);
  const [savingDetails, setSavingDetails] = createSignal(false);
  const [replacing, setReplacing] = createSignal(false);

  const limit = 24;
  const mediaUrl = (media: Media): string => apiClient.mediaUrl(media.url);

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

  const selectMedia = (media: Media): void => {
    setSelected(media);
    setDraft(draftFrom(media));
    setError('');
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
      setInfo(t('media.toasts.uploaded', { count: ok }));
      setPage(1);
      await load();
    }
  };

  const remove = async (media: Media): Promise<void> => {
    if (!confirm(t('media.details.confirmDelete', { filename: media.filename }))) return;
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
      const updated = await apiClient.updateMedia(media.id, draft());
      const merged = { ...media, ...updated };
      setSelected(merged);
      setDraft(draftFrom(merged));
      setInfo(t('media.details.saved'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingDetails(false);
    }
  };

  const replaceFile = async (file: File): Promise<void> => {
    const media = selected();
    if (!media) return;
    setReplacing(true);
    setError('');
    try {
      const updated = await apiClient.replaceMediaFile(media.id, file);
      const merged = { ...media, ...updated };
      setSelected(merged);
      setDraft(draftFrom(merged));
      setInfo(t('media.details.replaced'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReplacing(false);
    }
  };

  const copyUrl = async (url: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
      setInfo(t('media.details.copied'));
    } catch {
      setError(t('media.details.copyError'));
    }
  };

  return (
    <div class="media-library">
      <Show when={error()}><div class="notice notice--error">{error()}</div></Show>
      <Show when={info()}><div class="notice">{info()}</div></Show>

      <div
        classList={{ 'upload-zone': true, 'upload-zone--active': dragOver() || props.focusUpload }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer) void doUpload(e.dataTransfer.files);
        }}
      >
        <p><strong>{t('media.upload.dropzone')}</strong> ou</p>
        <label class="btn btn-primary" style={{ cursor: 'pointer' }}>
          {uploading() ? t('media.upload.uploading') : t('media.upload.select')}
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
        <p class="muted">{t('media.upload.hint')}</p>
      </div>

      <div class="toolbar">
        <Input
          name="media-search"
          placeholder={t('media.toolbar.search')}
          value={search()}
          onInput={(value) => { setSearch(value); void searchNow(); }}
        />
        <Select
          name="media-mime"
          placeholder={t('media.toolbar.allTypes')}
          value={mimeType()}
          options={[
            { value: 'image/png', label: t('media.mimeTypes.png') },
            { value: 'image/jpeg', label: t('media.mimeTypes.jpeg') },
            { value: 'image/gif', label: t('media.mimeTypes.gif') },
            { value: 'image/webp', label: t('media.mimeTypes.webp') },
            { value: 'image/svg+xml', label: t('media.mimeTypes.svg') },
            { value: 'application/pdf', label: t('media.mimeTypes.pdf') },
            { value: 'video/mp4', label: t('media.mimeTypes.mp4') },
            { value: 'audio/mpeg', label: t('media.mimeTypes.mp3') },
          ]}
          onChange={(value) => { setMimeType(value); void searchNow(); }}
        />
        <Button variant="secondary" onClick={() => void searchNow()}>{t('media.toolbar.searchBtn')}</Button>
      </div>

      <Show when={items().length > 0} fallback={<p class="muted">{t('media.empty')}</p>}>
        <div class="media-grid">
          <For each={items()}>
            {(media) => (
              <button
                type="button"
                classList={{ 'media-card': true, 'media-card--selected': selected()?.id === media.id }}
                onClick={() => selectMedia(media)}
              >
                <div class="media-card__preview">
                  <Show when={isImage(media)} fallback={<span class="media-card__ext">{media.mime_type.split('/')[1]?.toUpperCase() ?? 'FILE'}</span>}>
                    <img src={mediaUrl(media)} alt={media.alt ?? displayTitle(media)} loading="lazy" />
                  </Show>
                </div>
                <div class="media-card__meta">
                  <span class="media-card__name" title={displayTitle(media)}>{displayTitle(media)}</span>
                  <span class="muted">{media.filename} · {formatSize(media.size)}</span>
                </div>
              </button>
            )}
          </For>
        </div>
      </Show>

      <Pagination page={page()} limit={limit} total={total()} onPageChange={(next) => { setPage(next); void load(); }} />

      <Modal
        open={Boolean(selected())}
        title={selected() ? displayTitle(selected() as Media) : t('media.details.title')}
        onClose={() => setSelected(null)}
      >
        <Show when={selected()}>
          {(media) => (
            <div class="media-modal">
              <div class="media-modal__preview">
                <Show when={isImage(media())}>
                  <img src={mediaUrl(media())} alt={draft().alt || displayTitle(media())} />
                </Show>
                <Show when={isVideo(media())}><video controls src={mediaUrl(media())} /></Show>
                <Show when={isAudio(media())}><audio controls src={mediaUrl(media())} /></Show>
                <Show when={isPdf(media())}><iframe title={displayTitle(media())} src={mediaUrl(media())} /></Show>
                <Show when={!isImage(media()) && !isVideo(media()) && !isAudio(media()) && !isPdf(media())}>
                  <div class="media-card__ext media-modal__file-icon">{media().mime_type.split('/')[1]?.toUpperCase() ?? 'FILE'}</div>
                </Show>
              </div>

              <div class="media-modal__layout">
                <div class="media-modal__fields">
                  <Input name="media-title" label={t('media.details.titleField')} value={draft().title} onInput={(value) => setDraft({ ...draft(), title: value })} />
                  <Input name="media-alt" label={t('media.details.alt')} value={draft().alt} onInput={(value) => setDraft({ ...draft(), alt: value })} />
                  <Input name="media-caption" label={t('media.details.caption')} value={draft().caption} onInput={(value) => setDraft({ ...draft(), caption: value })} />
                  <label class="field__label">
                    {t('media.details.description')}
                    <textarea class="input media-modal__textarea" name="media-description" value={draft().description} onInput={(e) => setDraft({ ...draft(), description: e.currentTarget.value })} />
                  </label>
                </div>

                <dl class="media-details__list media-modal__facts">
                  <dt>{t('media.details.file')}</dt><dd>{media().filename}</dd>
                  <dt>{t('media.details.type')}</dt><dd>{media().mime_type}</dd>
                  <dt>{t('media.details.size')}</dt><dd>{formatSize(media().size)}</dd>
                  <Show when={dimensions(media())}><dt>{t('media.details.dimensions')}</dt><dd>{dimensions(media())}</dd></Show>
                  <dt>{t('media.details.uploaded')}</dt><dd>{media().created_at ? new Date(media().created_at as string).toLocaleString() : '—'}</dd>
                  <dt>{t('media.details.url')}</dt>
                  <dd class="media-details__url">
                    <code>{mediaUrl(media())}</code>
                    <button class="btn btn-secondary btn-sm" type="button" onClick={() => void copyUrl(mediaUrl(media()))}>{t('media.details.copy')}</button>
                  </dd>
                </dl>
              </div>

              <div class="media-modal__replace">
                <label class="btn btn-secondary" style={{ cursor: 'pointer' }}>
                  {replacing() ? t('media.details.replacing') : t('media.details.replace')}
                  <input type="file" style={{ display: 'none' }} disabled={replacing()} onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    if (file) void replaceFile(file);
                    e.currentTarget.value = '';
                  }} />
                </label>
                <span class="muted">{t('media.details.replaceHint')}</span>
              </div>

              <div class="media-details__actions">
                <Button variant="primary" disabled={savingDetails()} loading={savingDetails()} onClick={() => void saveDetails()}>{t('media.details.save')}</Button>
                <Button variant="danger" onClick={() => void remove(media())}>{t('media.details.delete')}</Button>
                <Button variant="secondary" onClick={() => setSelected(null)}>{t('media.details.close')}</Button>
              </div>
            </div>
          )}
        </Show>
      </Modal>
    </div>
  );
}
