// @oktis-works/admin - Date/Time Customizer
//
// Seletores de data/hora para o Theme Customizer.

import { createSignal } from 'solid-js';
import { useTranslation } from '../../i18n';

export type DateTimeType = 'date' | 'datetime-local' | 'time';

export interface DateTimeCustomizerProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  type: DateTimeType;
  placeholder?: string;
  label?: string;
  min?: string;
  max?: string;
  step?: string;
}

export function DateTimeCustomizer(props: DateTimeCustomizerProps) {
  const { t } = useTranslation();
  const {
    value,
    onChange,
    type,
    placeholder,
    label,
    min,
    max,
    step,
  } = props;

  const [currentValue, setCurrentValue] = createSignal(value || '');

  const handleChange = (e: Event) => {
    const newValue = (e.currentTarget as HTMLInputElement).value;
    setCurrentValue(newValue);
    onChange(newValue);
  };

  const typeLabels = {
    date: t('customizer.fieldTypes.date.label'),
    'datetime-local': t('customizer.fieldTypes.datetime.label'),
    time: t('customizer.fieldTypes.time.label'),
  };

  return (
    <div class="datetime-customizer">
      <label class="datetime-customizer__label">
        {label || typeLabels[type]}
      </label>
      <input
        type={type}
        class="input datetime-customizer__input"
        value={currentValue()}
        placeholder={placeholder || t(`customizer.fieldTypes.${type}.placeholder`)}
        min={min}
        max={max}
        step={step}
        onChange={handleChange}
      />
      <style>{`
        .datetime-customizer { display: flex; flex-direction: column; gap: 0.5rem; }
        .datetime-customizer__label { font-size: 0.75rem; font-weight: 600; color: var(--color-text); }
        .datetime-customizer__input { width: 100%; max-width: 280px; }
      `}</style>
    </div>
  );
}