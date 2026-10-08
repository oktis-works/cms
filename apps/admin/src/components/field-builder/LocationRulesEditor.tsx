import { For, Show } from 'solid-js';
import type { ContentType, LocationRule, Taxonomy } from '../../lib/api';
import { LOCATION_PARAMS, emptyLocationRule, normalizeLocationRuleValue } from './model';

type TFn = (key: string) => string;

interface LocationRulesEditorProps {
  rules: LocationRule[][];
  contentTypes: ContentType[];
  taxonomies: Taxonomy[];
  t: TFn;
  onChange: (rules: LocationRule[][]) => void;
}

/**
 * Location rules editor: rule groups (OR between groups, AND within a
 * group), each rule = param · operator · value, with add/remove.
 */
export function LocationRulesEditor(props: LocationRulesEditorProps) {
  const { t } = props;
  const L = (key: string): string => t(`settings.customFields.location.${key}`);

  const valueOptions = (param: LocationRule['param']): Array<{ value: string; label: string }> => {
    if (param === 'content_type') return props.contentTypes.map((type) => ({ value: type.slug, label: `${type.pluralLabel} (${type.slug})` }));
    if (param === 'taxonomy') return props.taxonomies.map((tax) => ({ value: tax.slug, label: `${tax.name} (${tax.slug})` }));
    if (param === 'post_status') return ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'TRASHED'].map((s) => ({ value: s, label: s }));
    return [];
  };

  const setRules = (next: LocationRule[][]): void => props.onChange(next.map((group) => group.map(normalizeLocationRuleValue)));

  const updateRule = (gi: number, ri: number, patch: Partial<LocationRule>): void => {
    setRules(props.rules.map((group, i) => (i === gi ? group.map((rule, r) => (r === ri ? { ...rule, ...patch } : rule)) : group)));
  };
  const addRule = (gi: number): void => {
    setRules(props.rules.map((group, i) => (i === gi ? [...group, emptyLocationRule()] : group)));
  };
  const removeRule = (gi: number, ri: number): void => {
    const next = props.rules
      .map((group, i) => (i === gi ? group.filter((_, r) => r !== ri) : group))
      .filter((group) => group.length > 0);
    setRules(next.length > 0 ? next : [[emptyLocationRule()]]);
  };
  const addGroup = (): void => setRules([...props.rules, [emptyLocationRule()]]);

  return (
    <div class="fb-rule-editor">
      <div class="fb-rule-groups">
        <For each={props.rules}>
          {(group, gi) => (
            <div class="fb-rule-group">
              <Show when={gi() > 0}><div class="fb-rule-group__connector">{L('or')}</div></Show>
              <div class="fb-rule-group__header">{gi() === 0 ? L('showIf') : L('or')}</div>
              <For each={group}>
                {(rule, ri) => (
                  <div class="fb-rule-row">
                    <select class="input" value={rule.param} onChange={(e) => {
                      const param = e.currentTarget.value as LocationRule['param'];
                      updateRule(gi(), ri(), { param, value: valueOptions(param)[0]?.value ?? '' });
                    }}>
                      <For each={LOCATION_PARAMS}>{(param) => <option value={param}>{t(`settings.customFields.location.params.${param}`)}</option>}</For>
                    </select>
                    <select class="input" value={rule.operator} onChange={(e) => updateRule(gi(), ri(), { operator: e.currentTarget.value as LocationRule['operator'] })}>
                      <option value="eq">{L('operators.eq')}</option>
                      <option value="neq">{L('operators.neq')}</option>
                    </select>
                    <Show when={valueOptions(rule.param).length > 0} fallback={
                      <input class="input" value={rule.value} placeholder={L('valuePlaceholder')} onInput={(e) => updateRule(gi(), ri(), { value: e.currentTarget.value })} />
                    }>
                      <select class="input" value={rule.value} onChange={(e) => updateRule(gi(), ri(), { value: e.currentTarget.value })}>
                        <For each={valueOptions(rule.param)}>{(opt) => <option value={opt.value}>{opt.label}</option>}</For>
                      </select>
                    </Show>
                    <button type="button" class="fb-rule-remove" aria-label={L('removeRule')} onClick={() => removeRule(gi(), ri())}>×</button>
                  </div>
                )}
              </For>
              <div class="fb-rule-group__actions">
                <button type="button" class="btn btn-secondary btn-sm" onClick={() => addRule(gi())}>+ {L('addRule')}</button>
              </div>
            </div>
          )}
        </For>
      </div>
      <button type="button" class="btn btn-secondary btn-sm fb-rule-add-group" onClick={addGroup}>+ {L('addGroup')}</button>
    </div>
  );
}
