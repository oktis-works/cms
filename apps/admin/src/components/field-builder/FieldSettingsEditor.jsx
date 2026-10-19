import { Show, createMemo, createSignal } from 'solid-js';
import { CHOICE_TYPES, DATE_TYPES, MEDIA_TYPES, RELATION_TYPES, TEXT_TYPES, hasSubFields, nameFromLabel, } from './model';
import { Tabs } from './primitives/Tabs';
import { ConditionalLogicEditor } from './ConditionalLogicEditor';
import { FieldTypePicker } from '../content/FieldTypePicker';
import { SearchableSelect } from './primitives/SearchableSelect';
import { PluginFieldConfig } from './PluginFieldConfig';
/**
 * Memória de aba por field: o patch de settings recria o objeto do field e o
 * `<For>` remonta a linha — sem isso a aba voltava para General a cada clique
 * (ex.: marcar "required" na aba Validation). Chaveada por clientId.
 */
const tabMemory = new Map();
const CONDITIONAL_OPERATORS = ['eq', 'neq', 'gt', 'lt', 'pattern_matches', 'contains', 'has_any_value', 'has_no_value'];
/**
 * Field settings editor: the five canonical tabs (General, Validation,
 * Presentation, Conditional Logic, Advanced). Type-specific settings are
 * injected into the correct tab. Uses the shared `config` JSON bag, matching
 * the backend field model.
 */
export function FieldSettingsEditor(props) {
    const [tab, setTab] = createSignal(tabMemory.get(props.field.clientId) ?? 'general');
    const selectTab = (id) => {
        tabMemory.set(props.field.clientId, id);
        setTab(id);
    };
    const { t, field } = props;
    const cfg = (key, fallback = '') => String(props.field.config[key] ?? fallback);
    const bool = (key, fallback = false) => {
        const value = props.field.config[key];
        return value === undefined ? fallback : value === true;
    };
    const setCfg = (key, value) => props.onChange({ config: { ...props.field.config, [key]: value } });
    const L = (key) => t(`settings.customFields.fieldSettings.${key}`);
    const conditionalActive = createMemo(() => {
        const logic = props.field.conditionalLogic;
        return Boolean(logic?.groups?.some((group) => (group.rules ?? []).length > 0));
    });
    // Auto-fill the machine name from the label until the user edits the name.
    const onLabelInput = (value) => {
        const patch = { label: value };
        if (!props.field.name || props.field.name.startsWith('field_')) {
            patch.name = nameFromLabel(value) || props.field.name;
        }
        props.onChange(patch);
    };
    const typeSpecific = (which) => (<Show when={which === 'general'}>
      {/* --- GENERAL: default value, choices, structural, relation source --- */}
      <Show when={TEXT_TYPES.has(field.type) && !['number', 'range'].includes(field.type)}>
        <Field label={L('defaultValue')}><input class="input" value={cfg('defaultValue')} onInput={(e) => setCfg('defaultValue', e.currentTarget.value)}/></Field>
      </Show>
      <Show when={['number', 'range'].includes(field.type)}>
        <Field label={L('defaultValue')}><input class="input" type="number" value={cfg('defaultValue')} onInput={(e) => setCfg('defaultValue', e.currentTarget.value)}/></Field>
      </Show>
      <Show when={CHOICE_TYPES.has(field.type)}>
        <Field label={L('choices')} wide hint={L('choicesHint')}>
          <textarea class="input" rows={5} placeholder={'value|Label'} value={choicesText(field.config['choices'] ?? field.config['options'])} onInput={(e) => setCfg('choices', parseChoices(e.currentTarget.value))}/>
        </Field>
        <Field label={L('defaultValue')}><input class="input" value={cfg('defaultValue')} onInput={(e) => setCfg('defaultValue', e.currentTarget.value)}/></Field>
      </Show>
      <Show when={field.type === 'true_false'}>
        <Field label={L('message')}><input class="input" value={cfg('message')} onInput={(e) => setCfg('message', e.currentTarget.value)}/></Field>
      </Show>
      <Show when={field.type === 'link'}>
        <Field label={L('returnFormat')}>
          <SearchableSelect value={cfg('returnFormat', 'array')} options={[
            { value: 'array', label: 'Array' },
            { value: 'url', label: 'URL' },
        ]} onChange={(v) => setCfg('returnFormat', v)} placeholder={L('returnFormat')}/>
        </Field>
      </Show>
      <Show when={field.type === 'wysiwyg'}>
        <Field label={L('defaultValue')} wide><textarea class="input" rows={3} value={cfg('defaultValue')} onInput={(e) => setCfg('defaultValue', e.currentTarget.value)}/></Field>
      </Show>
      <Show when={RELATION_TYPES.has(field.type)}>
        <Field label={L('postType')}><input class="input" placeholder="post, page…" value={cfg('postType')} onInput={(e) => setCfg('postType', e.currentTarget.value)}/></Field>
        <Show when={field.type !== 'user' && field.type !== 'link'}>
          <Field label={L('taxonomy')}><input class="input" placeholder="category…" value={cfg('taxonomy')} onInput={(e) => setCfg('taxonomy', e.currentTarget.value)}/></Field>
        </Show>
      </Show>
      <Show when={field.type === 'clone'}>
        <Field label={L('cloneSource')} wide hint={L('cloneSourceHint')}>
          <input class="input" placeholder="group_key ou field_name" value={cfg('cloneSource')} onInput={(e) => setCfg('cloneSource', e.currentTarget.value)}/>
        </Field>
      </Show>
      <Show when={hasSubFields(field.type)}>
        <Field label={L('layout')}>
          <SearchableSelect value={cfg('layout', field.type === 'repeater' ? 'table' : 'block')} options={[
            { value: 'block', label: 'Block' },
            { value: 'table', label: 'Table' },
            { value: 'row', label: 'Row' },
        ]} onChange={(v) => setCfg('layout', v)} placeholder={L('layout')}/>
        </Field>
      </Show>
      {/* Plugin field types - render plugin's custom config component */}
      <Show when={field.isPluginType && field.adminComponentPath}>
        <Field label={L('pluginConfig') ?? 'Configuração do Plugin'} wide>
          <PluginFieldConfig field={field} configSchema={field.configSchema} adminComponentPath={field.adminComponentPath} onChange={(patch) => props.onChange({ config: { ...field.config, ...patch.config } })} t={props.t}/>
        </Field>
      </Show>
    </Show>);
    const validationTab = () => (<Field label={L('required')} inline>
      <label class="fb-switch"><input type="checkbox" checked={field.required} onChange={(e) => props.onChange({ required: e.currentTarget.checked })}/><span>{field.required ? L('requiredOn') : L('requiredOff')}</span></label>
    </Field>);
    const presentationTab = () => (<>
      <Show when={TEXT_TYPES.has(field.type)}>
        <Field label={L('placeholder')}><input class="input" value={cfg('placeholder')} onInput={(e) => setCfg('placeholder', e.currentTarget.value)}/></Field>
        <Field label={L('prepend')}><input class="input" value={cfg('prepend')} onInput={(e) => setCfg('prepend', e.currentTarget.value)}/></Field>
        <Field label={L('append')}><input class="input" value={cfg('append')} onInput={(e) => setCfg('append', e.currentTarget.value)}/></Field>
      </Show>
      <Show when={field.type === 'textarea'}>
        <Field label={L('rows')}><input class="input" type="number" min={1} value={cfg('rows', '4')} onInput={(e) => setCfg('rows', Number(e.currentTarget.value) || 4)}/></Field>
      </Show>
      <Show when={CHOICE_TYPES.has(field.type)}>
        <Field label={L('layout')}>
          <SearchableSelect value={cfg('layout', 'vertical')} options={[
            { value: 'vertical', label: L('vertical') },
            { value: 'horizontal', label: L('horizontal') },
        ]} onChange={(v) => setCfg('layout', v)} placeholder={L('layout')}/>
        </Field>
      </Show>
      <Show when={MEDIA_TYPES.has(field.type)}>
        <Field label={L('previewSize')}><input class="input" value={cfg('previewSize', 'medium')} onInput={(e) => setCfg('previewSize', e.currentTarget.value)}/></Field>
        <Field label={L('library')}>
          <SearchableSelect value={cfg('library', 'all')} options={[
            { value: 'all', label: L('libraryAll') },
            { value: 'uploadedToPost', label: L('libraryUploaded') },
        ]} onChange={(v) => setCfg('library', v)} placeholder={L('library')}/>
        </Field>
      </Show>
      <Show when={field.type === 'google_map'}>
        <Field label={L('height')}><input class="input" type="number" value={cfg('height', '400')} onInput={(e) => setCfg('height', Number(e.currentTarget.value) || 400)}/></Field>
      </Show>
      {/* Wrapper width/class/id — present on every field. */}
      <Field label={L('wrapperWidth')} hint={L('wrapperWidthHint')}>
        <div class="fb-input-append-wrap">
          <input class="input" type="number" min={0} max={100} value={cfg('wrapperWidth')} onInput={(e) => setCfg('wrapperWidth', e.currentTarget.value ? Number(e.currentTarget.value) : undefined)}/>
          <span class="fb-append-suffix">%</span>
        </div>
      </Field>
      <Field label={L('wrapperClass')}><input class="input" value={cfg('wrapperClass')} onInput={(e) => setCfg('wrapperClass', e.currentTarget.value)}/></Field>
    </>);
    const advancedTab = () => (<>
      <Show when={RELATION_TYPES.has(field.type)}>
        <Field label={L('returnFormat')}>
          <SearchableSelect value={cfg('returnFormat', 'id')} options={[
            { value: 'id', label: 'ID' },
            { value: 'object', label: 'Object' },
            { value: 'array', label: 'Array' },
        ]} onChange={(v) => setCfg('returnFormat', v)} placeholder={L('returnFormat')}/>
        </Field>
        <Field label={L('multiple')} inline><input type="checkbox" checked={bool('multiple')} onChange={(e) => setCfg('multiple', e.currentTarget.checked)}/></Field>
        <Field label={L('allowNull')} inline><input type="checkbox" checked={bool('allowNull', true)} onChange={(e) => setCfg('allowNull', e.currentTarget.checked)}/></Field>
      </Show>
      <Show when={CHOICE_TYPES.has(field.type)}>
        <Field label={L('allowNull')} inline><input type="checkbox" checked={bool('allowNull')} onChange={(e) => setCfg('allowNull', e.currentTarget.checked)}/></Field>
        <Field label={L('multiple')} inline><input type="checkbox" checked={bool('multiple')} onChange={(e) => setCfg('multiple', e.currentTarget.checked)}/></Field>
      </Show>
      <Show when={field.type === 'select'}>
        <Field label={L('ui')} inline hint={L('uiHint')}><input type="checkbox" checked={bool('ui')} onChange={(e) => setCfg('ui', e.currentTarget.checked)}/></Field>
      </Show>
      <Show when={field.type === 'color_picker'}>
        <Field label={L('enableOpacity')} inline><input type="checkbox" checked={bool('enableOpacity')} onChange={(e) => setCfg('enableOpacity', e.currentTarget.checked)}/></Field>
      </Show>
      <Show when={DATE_TYPES.has(field.type)}>
        <Field label={L('firstDay')}><input class="input" type="number" min={0} max={6} value={cfg('firstDay', '1')} onInput={(e) => setCfg('firstDay', Number(e.currentTarget.value) || 0)}/></Field>
      </Show>
      <Show when={hasSubFields(field.type)}>
        <Field label={L('min')}><input class="input" type="number" min={0} value={cfg('min')} onInput={(e) => setCfg('min', e.currentTarget.value ? Number(e.currentTarget.value) : undefined)}/></Field>
        <Field label={L('max')}><input class="input" type="number" min={0} value={cfg('max')} onInput={(e) => setCfg('max', e.currentTarget.value ? Number(e.currentTarget.value) : undefined)}/></Field>
        <Show when={field.type === 'repeater'}>
          <Field label={L('buttonLabel')}><input class="input" value={cfg('buttonLabel', 'Add Row')} onInput={(e) => setCfg('buttonLabel', e.currentTarget.value)}/></Field>
          <Field label={L('collapsed')} hint={L('collapsedHint')}><input class="input" placeholder="field_name" value={cfg('collapsed')} onInput={(e) => setCfg('collapsed', e.currentTarget.value)}/></Field>
        </Show>
      </Show>
      <Field label={L('instructions')} wide><textarea class="input" rows={2} value={field.instructions ?? ''} onInput={(e) => props.onChange({ instructions: e.currentTarget.value })}/></Field>
    </>);
    return (<div class="fb-field-settings">
      <Tabs ariaLabel={t('settings.customFields.fieldSettings.ariaLabel')} active={tab()} onChange={selectTab} tabs={[
            { id: 'general', label: L('general') },
            { id: 'validation', label: L('validation') },
            { id: 'presentation', label: L('presentation') },
            { id: 'conditional_logic', label: L('conditionalLogic'), badge: conditionalActive() ? L('conditionalActive') : undefined },
            { id: 'advanced', label: L('advanced') },
        ]}>
        <Show when={tab() === 'general'}>
          <div class="fb-settings-grid">
            <Field label={L('fieldType')} wide>
              <FieldTypePicker categories={props.categories} types={props.types} value={field.type} onChange={(type) => props.onChange({ type })}/>
            </Field>
            <Field label={L('fieldLabel')}><input class="input" value={field.label} onInput={(e) => onLabelInput(e.currentTarget.value)}/></Field>
            <Field label={L('fieldName')} hint={L('fieldNameHint')}><input class="input" pattern="[a-zA-Z0-9_]+" value={field.name} onInput={(e) => props.onChange({ name: e.currentTarget.value })}/></Field>
            {typeSpecific('general')}
          </div>
        </Show>
        <Show when={tab() === 'validation'}>
          <div class="fb-settings-grid">{validationTab()}</div>
        </Show>
        <Show when={tab() === 'presentation'}>
          <div class="fb-settings-grid">
            <Field label={L('instructions')} wide><textarea class="input" rows={2} value={field.instructions ?? ''} onInput={(e) => props.onChange({ instructions: e.currentTarget.value })}/></Field>
            {presentationTab()}
          </div>
        </Show>
        <Show when={tab() === 'conditional_logic'}>
          <ConditionalLogicEditor value={props.field.conditionalLogic} fields={props.conditionFields.filter((f) => f.value !== props.field.name)} t={t} onChange={(value) => props.onChange({ conditionalLogic: value })}/>
        </Show>
        <Show when={tab() === 'advanced'}>
          <div class="fb-settings-grid">{advancedTab()}</div>
        </Show>
      </Tabs>
    </div>);
}
// --- tiny presentational helpers --------------------------------------------
function Field(props) {
    return (<label classList={{ 'fb-setting': true, 'fb-setting--wide': props.wide, 'fb-setting--inline': props.inline }}>
      <span class="fb-setting__label">{props.label}</span>
      {props.children}
      <Show when={props.hint}><span class="fb-setting__hint">{props.hint}</span></Show>
    </label>);
}
function choicesText(value) {
    if (!Array.isArray(value))
        return '';
    return value
        .map((choice) => {
        if (!choice || typeof choice !== 'object')
            return String(choice);
        const row = choice;
        return `${String(row['value'] ?? '')}|${String(row['label'] ?? row['value'] ?? '')}`;
    })
        .join('\n');
}
function parseChoices(value) {
    return value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
        const [rawValue = '', ...labelParts] = line.split('|');
        const v = rawValue.trim();
        return { value: v, label: labelParts.join('|').trim() || v };
    });
}
export { CONDITIONAL_OPERATORS };
//# sourceMappingURL=FieldSettingsEditor.jsx.map