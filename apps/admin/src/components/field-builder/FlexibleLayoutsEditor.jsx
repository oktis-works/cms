import { For, Show } from 'solid-js';
import { FieldListEditor } from './FieldListEditor';
import { clientId } from './model';
/**
 * Flexible-content layouts editor. Each layout is an expandable card with
 * its own name/label/display/min/max and a nested sub-field list.
 */
export function FlexibleLayoutsEditor(props) {
    const { t } = props;
    const L = (key) => t(`settings.customFields.fieldSettings.${key}`);
    const layouts = () => props.field.layouts;
    const updateLayout = (id, patch) => props.onChange({ layouts: layouts().map((layout) => (layout.clientId === id ? { ...layout, ...patch } : layout)) });
    const addLayout = () => props.onChange({
        layouts: [
            ...layouts(),
            {
                clientId: clientId('layout'),
                name: `layout_${layouts().length + 1}`,
                label: `${L('newLayout')} ${layouts().length + 1}`,
                display: 'block',
                subFields: [],
            },
        ],
    });
    const removeLayout = (id) => props.onChange({ layouts: layouts().filter((l) => l.clientId !== id) });
    return (<div class="fb-layouts">
      <div class="fb-subfields__header">
        <h5>{L('layouts')}</h5>
        <button type="button" class="btn btn-secondary btn-sm" onClick={addLayout}>+ {L('addLayout')}</button>
      </div>

      <Show when={layouts().length > 0} fallback={<p class="muted">{L('noLayouts')}</p>}>
        <For each={layouts()}>
          {(layout) => (<div class="fb-layout-card">
              <div class="fb-layout-card__header">
                <span class="fb-field-row__order">{layout.name}</span>
                <strong>{layout.label}</strong>
                <span class="fb-layout-card__display">{layout.display}</span>
                <button type="button" class="fb-row-action is-danger" onClick={() => removeLayout(layout.clientId)}>{t('settings.customFields.form.removeField')}</button>
              </div>
              <div class="fb-settings-grid fb-layout-card__settings">
                <label class="fb-setting"><span class="fb-setting__label">{L('layoutName')}</span>
                  <input class="input" value={layout.name} onInput={(e) => updateLayout(layout.clientId, { name: e.currentTarget.value })}/>
                </label>
                <label class="fb-setting"><span class="fb-setting__label">{L('layoutLabel')}</span>
                  <input class="input" value={layout.label} onInput={(e) => updateLayout(layout.clientId, { label: e.currentTarget.value })}/>
                </label>
                <label class="fb-setting"><span class="fb-setting__label">{L('layoutDisplay')}</span>
                  <select class="input" value={layout.display} onChange={(e) => updateLayout(layout.clientId, { display: e.currentTarget.value })}>
                    <option value="block">Block</option><option value="table">Table</option><option value="row">Row</option>
                  </select>
                </label>
                <label class="fb-setting"><span class="fb-setting__label">{L('min')}</span>
                  <input class="input" type="number" min={0} value={layout.min ?? ''} onInput={(e) => updateLayout(layout.clientId, { min: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })}/>
                </label>
                <label class="fb-setting"><span class="fb-setting__label">{L('max')}</span>
                  <input class="input" type="number" min={0} value={layout.max ?? ''} onInput={(e) => updateLayout(layout.clientId, { max: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })}/>
                </label>
              </div>
              <div class="fb-subfields fb-subfields--layout">
                <FieldListEditor fields={layout.subFields} types={props.types} categories={props.categories} t={t} listId={`${props.field.clientId}:${layout.clientId}`} depth={1} isSubField expandedId={props.expandedId} setExpandedId={props.setExpandedId} conditionFields={props.conditionFields} onChange={(subFields) => updateLayout(layout.clientId, { subFields })}/>
              </div>
            </div>)}
        </For>
      </Show>
    </div>);
}
//# sourceMappingURL=FlexibleLayoutsEditor.jsx.map