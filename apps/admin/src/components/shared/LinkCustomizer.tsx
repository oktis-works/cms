// @oktis-works/admin - Link Customizer
//
// Seletor de link para o Theme Customizer (URL + target).

import { createSignal } from 'solid-js';
import { useTranslation } from '../../i18n';

export interface LinkCustomizerProps {
  value: { url: string; target?: string } | null | undefined;
  onChange: (value: { url: string; target: string }) => void;
  placeholder?: string;
  label?: string;
}

export function LinkCustomizer(props: LinkCustomizerProps) {
  const { t } = useTranslation();
  const {
    value,
    onChange,
    placeholder = 'https:// ou /caminho',
    label,
  } = props;

  const [url, setUrl] = createSignal(value?.url || '');
  const [target, setTarget] = createSignal(value?.target || '_self');

  const handleUrlChange = (e: Event) => {
    const newUrl = (e.currentTarget as HTMLInputElement).value;
    setUrl(newUrl);
    onChange({ url: newUrl, target: target() });
  };

  const handleTargetChange = (e: Event) => {
    const newTarget = (e.currentTarget as HTMLSelectElement).value;
    setTarget(newTarget);
    onChange({ url: url(), target: newTarget });
  };

  return (
    <div class="link-customizer">
      <label class="link-customizer__label">
        {label || t('customizer.fieldTypes.link.label')}
      </label>
      <div class="link-customizer__fields">
        <input
          type="url"
          class="input link-customizer__url"
          placeholder={placeholder}
          value={url()}
          onInput={handleUrlChange}
        />
        <select
          class="input link-customizer__target"
          value={target()}
          onChange={handleTargetChange}
        >
          <option value="_self">{t('customizer.fieldTypes.link.targetSelf')}</option>
          <option value="_blank">{t('customizer.fieldTypes.link.targetBlank')}</option>
        </select>
      </div>
      <style>{`
        .link-customizer { display: flex; flex-direction: column; gap: 0.5rem; }
        .link-customizer__label { font-size: 0.75rem; font-weight: 600; color: var(--color-text); }
        .link-customizer__fields { display: flex; gap: 0.5rem; }
        .link-customizer__url { flex: 1; }
        .link-customizer__target { width: 140px; flex-shrink: 0; }
      `}</style>
    </div>
  );
}