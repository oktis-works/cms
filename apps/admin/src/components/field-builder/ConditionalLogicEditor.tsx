import { For, Show } from 'solid-js';
import { readConditional, type ConditionalLogic, type ConditionalRule } from './model';

type TFn = (key: string) => string;

interface ConditionalLogicEditorProps {
  value: unknown;
  fields: Array<{ value: string; label: string }>;
  t: TFn;
  onChange: (value: ConditionalLogic | null) => void;
}

const OPERATORS = [
  { id: 'eq', key: 'eq', needsValue: true },
  { id: 'neq', key: 'neq', needsValue: true },
  { id: 'gt', key: 'gt', needsValue: true },
  { id: 'lt', key: 'lt', needsValue: true },
  { id: 'pattern_matches', key: 'pattern', needsValue: true },
  { id: 'contains', key: 'contains', needsValue: true },
  { id: 'has_any_value', key: 'hasAny', needsValue: false },
  { id: 'has_no_value', key: 'hasNone', needsValue: false },
];

/**
 * Conditional Logic editor. Toggle enables/disables; rules are grouped
 * (AND within a group, OR across groups) in the classic
 * "Show this field if … or …" structure.
 */
export function ConditionalLogicEditor(props: ConditionalLogicEditorProps) {
  const { t } = props;
  const L = (key: string): string => t(`settings.customFields.fieldSettings.${key}`);
  const enabled = () => readConditional(props.value).groups.some((g) => g.rules.length > 0);
  const logic = (): ConditionalLogic => readConditional(props.value);

  const emit = (next: ConditionalLogic): void => {
    props.onChange(next.groups.some((group) => group.rules.length > 0) ? next : null);
  };
  const patchRule = (gi: number, ri: number, patch: Partial<ConditionalRule>): void => {
    const next = logic();
    next.groups = next.groups.map((group, i) =>
      i === gi ? { ...group, rules: group.rules.map((rule, r) => (r === ri ? { ...rule, ...patch } : rule)) } : group
    );
    emit(next);
  };
  const removeRule = (gi: number, ri: number): void => {
    const next = logic();
    next.groups = next.groups
      .map((group, i) => (i === gi ? { ...group, rules: group.rules.filter((_, r) => r !== ri) } : group))
      .filter((group, i) => group.rules.length > 0 || i === 0);
    emit(next);
  };
  const addRule = (gi: number): void => {
    const next = logic();
    next.groups = next.groups.map((group, i) =>
      i === gi ? { ...group, rules: [...group.rules, { field: props.fields[0]?.value ?? '', operator: 'eq', value: '' }] } : group
    );
    emit(next);
  };
  const addGroup = (): void => {
    const next = logic();
    next.groups = [...next.groups, { match: 'ALL', rules: [{ field: props.fields[0]?.value ?? '', operator: 'eq', value: '' }] }];
    emit(next);
  };
  const setEnabled = (on: boolean): void => {
    if (on) {
      emit({ match: 'ANY', groups: [{ match: 'ALL', rules: [{ field: props.fields[0]?.value ?? '', operator: 'eq', value: '' }] }] });
    } else {
      props.onChange(null);
    }
  };

  return (
    <div class="fb-rule-editor">
      <label class="fb-rule-editor__toggle">
        <input type="checkbox" checked={enabled()} onChange={(e) => setEnabled(e.currentTarget.checked)} />
        <span>{L('conditionalLogic')}</span>
        <Show when={enabled()}><span class="fb-tabs__badge">{L('conditionalActive')}</span></Show>
      </label>

      <Show when={enabled()}>
        <div class="fb-rule-groups">
          <For each={logic().groups}>
            {(group, gi) => (
              <div class="fb-rule-group">
                <Show when={gi() > 0}>
                  <div class="fb-rule-group__connector">{L('or')}</div>
                </Show>
                <div class="fb-rule-group__header">{gi() === 0 ? L('showIf') : L('or')}</div>
                <For each={group.rules}>
                  {(rule, ri) => (
                    <div class="fb-rule-row">
                      <select class="input" value={rule.field} onChange={(e) => patchRule(gi(), ri(), { field: e.currentTarget.value })}>
                        <option value="">{L('chooseField')}</option>
                        <For each={props.fields}>{(f) => <option value={f.value}>{f.label}</option>}</For>
                      </select>
                      <select class="input" value={rule.operator} onChange={(e) => patchRule(gi(), ri(), { operator: e.currentTarget.value })}>
                        <For each={OPERATORS}>{(op) => <option value={op.id}>{L(`operators.${op.key}`)}</option>}</For>
                      </select>
                      <Show when={OPERATORS.find((o) => o.id === rule.operator)?.needsValue ?? true}>
                        <input class="input" value={rule.value ?? ''} placeholder={L('conditionValue')} onInput={(e) => patchRule(gi(), ri(), { value: e.currentTarget.value })} />
                      </Show>
                      <Show when={!(OPERATORS.find((o) => o.id === rule.operator)?.needsValue ?? true)}>
                        <span class="fb-rule-row__spacer" />
                      </Show>
                      <button type="button" class="fb-rule-remove" aria-label={L('removeRule')} onClick={() => removeRule(gi(), ri())}>×</button>
                    </div>
                  )}
                </For>
                <div class="fb-rule-group__actions">
                  <button type="button" class="btn btn-secondary btn-sm" onClick={() => addRule(gi())}>+ {L('addCondition')}</button>
                  <Show when={group.rules.length > 1}><span class="fb-rule-group__and">{L('and')}</span></Show>
                </div>
              </div>
            )}
          </For>
          <button type="button" class="btn btn-secondary btn-sm fb-rule-add-group" onClick={addGroup}>+ {L('addConditionGroup')}</button>
        </div>
      </Show>
    </div>
  );
}
