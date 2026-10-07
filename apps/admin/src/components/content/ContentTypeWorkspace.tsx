// @oktis-works/admin - Roteador visual por content type

import { Show, createSignal, onMount } from 'solid-js';
import { apiClient, type ContentType } from '../../lib/api';
import { useTranslation } from '../../i18n';
import { ContentEditor } from './ContentEditor';
import { ContentList } from './ContentList';

interface Props {
  contentType: string;
}

export function ContentTypeWorkspace(props: Props) {
  const { t } = useTranslation();
  const [type, setType] = createSignal<ContentType | null>(null);
  const [error, setError] = createSignal('');

  onMount(async () => {
    try {
      const match = (await apiClient.getContentTypes()).find((entry) => entry.slug === props.contentType);
      if (!match) {
        setError(t('content.list.typeNotFound'));
        return;
      }
      setType(match);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  });

  return (
    <Show when={type()} fallback={error() ? <div class="notice notice--error">{error()}</div> : <div class="card">{t('common.loading')}</div>}>
      {(current) => (
        <Show
          when={current().singleton}
          fallback={<ContentList contentType={current().slug} />}
        >
          <ContentEditor initialType={current().slug} singleton />
        </Show>
      )}
    </Show>
  );
}
