// @oktis-works/admin - Media Picker for Theme Customizer
//
// Media selector for the Theme Customizer.
// Supports selecting existing media and uploading new files.

import { For, Show, createSignal, onMount } from 'solid-js';
import { apiClient, type Media } from '../../lib/api';
import { useTranslation } from '../../i18n';

export interface MediaPickerCustomizerProps {
  value: string | string[] | null | undefined;
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
  accept?: string;
  label?: string;
  placeholder?: string;
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

function getMediaIcon(media: Media): string {
  if (isImage(media)) return '🖼️';
  if (isVideo(media)) return '🎬';
  if (isAudio(media)) return '🎵';
  if (isPdf(media)) return '📄';
  return '📎';
}

function mediaUrl(media: Media): string {
  return apiClient.mediaUrl(media.url);
}

export function MediaPickerCustomizer(props: MediaPickerCustomizerProps) {
  const { t } = useTranslation();
  const {
    value,
    onChange,
    multiple = false,
    accept,
    label,
    placeholder = 'Clique para selecionar mídia',
  } = props;

  const [items, setItems] = createSignal<Media[]>([]);
  const [total, setTotal] = createSignal(0);
  const [page, setPage] = createSignal(1);
  const [search, setSearch] = createSignal('');
  const [mimeTypeFilter, setMimeTypeFilter] = createSignal('');
  const [error, setError] = createSignal('');
  const [uploading, setUploading] = createSignal(false);
  const [showModal, setShowModal] = createSignal(false);
  const [dragOver, setDragOver] = createSignal(false);
  const [selectedIds, setSelectedIds] = createSignal<string[]>([]);

  const limit = 20;

  // Normalize value to array of IDs
  const currentIds = Array.isArray(value) ? value : value ? [value] : [];
  onMount(() => {
    setSelectedIds(currentIds);
    load();
  });

  const load = async (): Promise<void> => {
    try {
      setError('');
      const result = await apiClient.listMedia({
        page: page(),
        limit,
        search: search() || undefined,
        mimeType: mimeTypeFilter() || undefined,
      });
      setItems(result.data ?? []);
      setTotal(result.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const searchNow = async (): Promise<void> => {
    setPage(1);
    await load();
  };

  const handleFileSelect = (files: FileList | File[]): void => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    // Filter by accept type if specified
    const filtered = accept
      ? fileArray.filter((f) => {
          if (accept === 'image/*') return f.type.startsWith('image/');
          if (accept === 'video/*') return f.type.startsWith('video/');
          if (accept === 'audio/*') return f.type.startsWith('audio/');
          return true;
        })
      : fileArray;

    if (filtered.length !== fileArray.length) {
      setError(`Alguns arquivos foram ignorados (tipo não permitido: ${accept})`);
    }

    if (filtered.length > 0) {
      doUpload(filtered);
    }
  };

  const doUpload = async (files: File[]): Promise<void> => {
    if (files.length === 0) return;
    setUploading(true);
    setError('');

    try {
      for (const file of files) {
        const uploaded = await apiClient.uploadMedia(file);
        // Select the newly uploaded media
        const current = selectedIds();
        if (multiple) {
          setSelectedIds([...current, uploaded.id]);
        } else {
          setSelectedIds([uploaded.id]);
        }
        onChange(multiple ? [...current, uploaded.id] : uploaded.id);
      }
      setError(`${files.length} file(s) uploaded successfully`);
      await load(); // Refresh list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no upload');
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (e: DragEvent): void => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent): void => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: DragEvent): void => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  const toggleSelect = (mediaId: string): void => {
    const current = selectedIds();
    if (current.includes(mediaId)) {
      setSelectedIds(current.filter((id) => id !== mediaId));
    } else if (multiple) {
      setSelectedIds([...current, mediaId]);
    } else {
      setSelectedIds([mediaId]);
    }
    const newIds = multiple
      ? current.includes(mediaId)
        ? current.filter((id) => id !== mediaId)
        : [...current, mediaId]
      : [mediaId];
    onChange(multiple ? newIds : newIds[0] ?? '');
  }

  const isSelected = (mediaId: string): boolean => selectedIds().includes(mediaId);

  const clearSelection = (): void => {
    setSelectedIds([]);
    onChange(multiple ? [] : '');
    setShowModal(false);
  };

  const confirmSelection = (): void => {
    setShowModal(false);
  }

  const openModal = (): void => {
    setShowModal(true);
    setPage(1);
    load();
  };

  return (
    <div class="media-picker-customizer">
      <label class="media-picker-customizer__trigger" onClick={openModal}>
        <span class="media-picker-customizer__icon">🖼️</span>
        <span class="media-picker-customizer__text">
          {selectedIds().length > 0
            ? `${selectedIds().length} mídia(s) selecionada(s)`
            : placeholder}
        </span>
        {label && <span class="media-picker-customizer__label">{label}</span>}
      </label>

      {error() && <div class="media-picker-customizer__error">{error()}</div>}

      <Show when={showModal()}>
        <div class="media-picker-customizer__modal-overlay" onClick={() => setShowModal(false)}>
          <div class="media-picker-customizer__modal" onClick={(e) => e.stopPropagation()}>
            <div class="media-picker-customizer__modal-header">
              <h3>{t('media.picker.title')}</h3>
              <div class="media-picker-customizer__modal-actions">
                <label class="media-picker-customizer__upload-btn">
                  <input
                    type="file"
                    multiple={multiple}
                    accept={accept}
                    onChange={(e) => e.currentTarget.files && handleFileSelect(e.currentTarget.files)}
                    style={{ display: 'none' }}
                  />
                  <span class="btn btn-primary">{uploading() ? 'Enviando...' : t('media.picker.upload')}</span>
                </label>
                <button class="btn btn-secondary" onClick={clearSelection}>
                  {t('media.picker.clear')}
                </button>
                <button class="btn btn-primary" onClick={confirmSelection} disabled={selectedIds().length === 0}>
                  {t('media.picker.confirm')}
                </button>
              </div>
            </div>

            <div class="media-picker-customizer__toolbar">
              <input
                type="text"
                class="input"
                placeholder={t('media.picker.search')}
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchNow()}
              />
              <button class="btn btn-secondary" onClick={searchNow}>
                {t('media.picker.search')}
              </button>
              <Select
                value={mimeTypeFilter()}
                onChange={(e) => { setMimeTypeFilter(e.currentTarget.value); setPage(1); load(); }}
              >
                <option value="">{t('media.picker.allTypes')}</option>
                <option value="image/">{t('media.picker.images')}</option>
                <option value="video/">{t('media.picker.videos')}</option>
                <option value="audio/">{t('media.picker.audio')}</option>
                <option value="application/pdf">{t('media.picker.pdfs')}</option>
              </Select>
            </div>

            <div
              class="media-picker-customizer__dropzone"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              classList={{ 'drag-over': dragOver() }}
            >
              <span class="media-picker-customizer__dropzone-text">
                {t('media.picker.dropzone')}
              </span>
              <input
                type="file"
                multiple={multiple}
                accept={accept}
                onChange={(e) => e.currentTarget.files && handleFileSelect(e.currentTarget.files)}
                style={{ display: 'none' }}
                ref={(el) => { if (el) el.id = 'media-picker-file-input'; }}
              />
              <label for="media-picker-file-input" class="btn btn-secondary">
                {t('media.picker.selectFiles')}
              </label>
            </div>

            <div class="media-picker-customizer__grid">
              <For each={items()}>
                {(media) => (
                  <div
                    class="media-picker-customizer__item"
                    classList={{ selected: isSelected(media.id) }}
                    onClick={() => toggleSelect(media.id)}
                  >
                    <div class="media-picker-customizer__preview">
                      {isImage(media) ? (
                        <img src={mediaUrl(media)} alt="" loading="lazy" />
                      ) : (
                        <div class="media-picker-customizer__icon-large">
                          {getMediaIcon(media)}
                        </div>
                      )}
                      {isSelected(media.id) && (
                        <div class="media-picker-customizer__checkmark">✓</div>
                      )}
                    </div>
                    <div class="media-picker-customizer__info">
                      <span class="media-picker-customizer__name">{media.title || media.filename}</span>
                      <span class="media-picker-customizer__meta">
                        {formatSize(media.size)} · {media.mime_type}
                      </span>
                    </div>
                  </div>
                )}
              </For>
              {items().length === 0 && (
                <div class="media-picker-customizer__empty">
                  {total() === 0 ? t('media.picker.empty') : t('media.picker.noResults')}
                </div>
              )}
            </div>

            <Show when={total() > limit}>
              <div class="media-picker-customizer__pagination">
                <button
                  class="btn btn-secondary"
                  onClick={() => { setPage(page() - 1); load(); }}
                  disabled={page() <= 1}
                >
                  ← {t('media.picker.prev')}
                </button>
                <span>
                  {t('media.picker.page', { current: page(), total: Math.ceil(total() / limit) })}
                </span>
                <button
                  class="btn btn-secondary"
                  onClick={() => { setPage(page() + 1); load(); }}
                  disabled={page() >= Math.ceil(total() / limit)}
                >
                  {t('media.picker.next')} →
                </button>
              </div>
            </Show>
          </div>
        </div>
      </Show>

      <style>{`
        .media-picker-customizer { position: relative; }
        .media-picker-customizer__trigger {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          background: var(--color-white);
          color: var(--color-text);
          cursor: pointer;
          transition: all 0.15s ease;
          min-width: 200px;
        }
        .media-picker-customizer__trigger:hover {
          border-color: var(--color-primary);
        }
        .media-picker-customizer__icon { font-size: 1.25rem; }
        .media-picker-customizer__text { flex: 1; font-size: 0.875rem; }
        .media-picker-customizer__label { font-size: 0.75rem; color: var(--color-muted); }
        .media-picker-customizer__error { color: var(--color-error); font-size: 0.75rem; margin-top: 0.25rem; }
        .media-picker-customizer__modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }
        .media-picker-customizer__modal {
          background: var(--color-white);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-xl);
          width: 100%;
          max-width: 900px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .media-picker-customizer__modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem;
          border-bottom: 1px solid var(--color-border);
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .media-picker-customizer__modal-header h3 { margin: 0; font-size: 1rem; }
        .media-picker-customizer__modal-actions { display: flex; gap: 0.5rem; }
        .media-picker-customizer__upload-btn { position: relative; }
        .media-picker-customizer__upload-btn input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
        .media-picker-customizer__toolbar {
          display: flex;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid var(--color-border);
          flex-wrap: wrap;
          align-items: center;
        }
        .media-picker-customizer__toolbar input[type="text"] { flex: 1; min-width: 200px; }
        .media-picker-customizer__dropzone {
          padding: 2rem;
          border: 2px dashed var(--color-border);
          border-radius: var(--radius-md);
          margin: 1rem;
          text-align: center;
          transition: all 0.15s ease;
        }
        .media-picker-customizer__dropzone.drag-over {
          border-color: var(--color-primary);
          background: var(--color-primary-soft);
        }
        .media-picker-customizer__dropzone input[type="file"] { display: none; }
        .media-picker-customizer__dropzone-text { color: var(--color-muted); font-size: 0.875rem; }
        .media-picker-customizer__grid {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 0.75rem;
        }
        .media-picker-customizer__item {
          border: 2px solid var(--color-border);
          border-radius: var(--radius-md);
          overflow: hidden;
          cursor: pointer;
          transition: all 0.15s ease;
          background: var(--color-white);
        }
        .media-picker-customizer__item:hover { border-color: var(--color-primary); }
        .media-picker-customizer__item.selected {
          border-color: var(--color-primary);
          box-shadow: 0 0 0 2px var(--color-primary);
        }
        .media-picker-customizer__preview {
          aspect-ratio: 16/9;
          background: #f5f5f5;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }
        .media-picker-customizer__preview img { width: 100%; height: 100%; object-fit: cover; }
        .media-picker-customizer__icon-large { font-size: 3rem; color: var(--color-muted); }
        .media-picker-customizer__checkmark {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          background: var(--color-primary);
          color: white;
          width: 1.5rem;
          height: 1.5rem;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
        }
        .media-picker-customizer__info { padding: 0.5rem; }
        .media-picker-customizer__name { display: block; font-size: 0.75rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .media-picker-customizer__meta { display: block; font-size: 0.625rem; color: var(--color-muted); margin-top: 0.125rem; }
        .media-picker-customizer__empty { grid-column: 1 / -1; padding: 3rem; text-align: center; color: var(--color-muted); }
        .media-picker-customizer__pagination { display: flex; align-items: center; justify-content: center; gap: 1rem; padding: 1rem; border-top: 1px solid var(--color-border); font-size: 0.8125rem; color: var(--color-muted); }
      `}</style>
    </div>
  );
}

// Simple Select component (inline to avoid dependency)
function Select(props: { value: string; onChange: (e: Event & { currentTarget: HTMLSelectElement }) => void; children: any }) {
  return (
    <select class="input" value={props.value} onChange={props.onChange}>
      {props.children}
    </select>
  );
}
