// @oktis-works/admin - TimezoneSelect (estilo WordPress)
//
// Dropdown buscável com as zonas IANA completas, rotuladas com o offset UTC
// no momento atual: `(UTC-03:00) America/Sao_Paulo` — o mesmo formato do
// select de timezone do WordPress (timezone_string). A opção "UTC" fica no
// topo; a lista é ordenada por offset e depois pelo nome da zona. O valor
// salvo é o id IANA (ex.: `America/Sao_Paulo`), como no WordPress.
import { For, Show, createMemo, createSignal } from 'solid-js';
import { FloatingPanel } from '../../ui/FloatingPanel';
const formatterCache = new Map();
/** Offset atual da zona: `{ label: 'UTC-03:00', minutes: -180 }`. */
function offsetInfo(tz) {
    let dtf = formatterCache.get(tz);
    if (!dtf) {
        dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' });
        formatterCache.set(tz, dtf);
    }
    const raw = dtf.formatToParts(new Date()).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
    const match = raw.match(/GMT([+-])(\d{2}):(\d{2})/);
    if (!match)
        return { label: 'UTC+00:00', minutes: 0 };
    const minutes = (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
    return { label: `UTC${match[1]}${match[2]}:${match[3]}`, minutes };
}
/** Lista completa: UTC no topo + zonas IANA ordenadas por offset e nome. */
export function buildTimezoneOptions() {
    const intl = Intl;
    const zones = typeof intl.supportedValuesOf === 'function' ? intl.supportedValuesOf('timeZone') : ['UTC'];
    const options = zones.map((tz) => {
        const { label, minutes } = offsetInfo(tz);
        return { tz, label: `(UTC${label.slice(3)}) ${tz}`, minutes };
    });
    options.sort((a, b) => a.minutes - b.minutes || a.tz.localeCompare(b.tz));
    return [{ tz: 'UTC', label: '(UTC+00:00) UTC', minutes: 0 }, ...options];
}
/** Normaliza para busca: sem caixa, `/` e `_` viram espaço. */
const normalize = (text) => text.toLowerCase().replace(/[/_\-]/g, ' ');
export function TimezoneSelect(props) {
    const [open, setOpen] = createSignal(false);
    const [query, setQuery] = createSignal('');
    let root;
    const [trigger, setTrigger] = createSignal(undefined);
    const options = createMemo(() => buildTimezoneOptions());
    const selected = createMemo(() => options().find((option) => option.tz === props.value));
    const filtered = createMemo(() => {
        const q = normalize(query().trim());
        if (!q)
            return options();
        return options().filter((option) => normalize(option.label).includes(q));
    });
    // Fechar por clique fora / Escape / scroll fica com o FloatingPanel — o
    // painel é portalado para o body e nenhum `overflow` do formulário o corta.
    return (<div class="tz-select" ref={root}>
      <button type="button" class="input tz-select__trigger" aria-haspopup="listbox" aria-expanded={open()} ref={setTrigger} onClick={() => setOpen(!open())}>
        <span class="tz-select__value">{selected()?.label ?? props.placeholder ?? ''}</span>
        <span aria-hidden="true">{open() ? '▴' : '▾'}</span>
      </button>

      <FloatingPanel open={open()} trigger={trigger()} onClose={() => { setOpen(false); setQuery(''); }} class="tz-select__panel" role="listbox" minWidth={320}>
        <input type="search" class="input tz-select__search" placeholder={props.searchPlaceholder ?? props.placeholder ?? ''} value={query()} onInput={(event) => setQuery(event.currentTarget.value)} ref={(element) => queueMicrotask(() => element.focus())}/>
        <div class="tz-select__options">
          <Show when={filtered().length > 0} fallback={<p class="tz-select__empty">—</p>}>
            <For each={filtered()}>
              {(option) => (<button type="button" role="option" aria-selected={props.value === option.tz} class="tz-select__option" classList={{ 'is-selected': props.value === option.tz }} onClick={() => {
                props.onChange(option.tz);
                setOpen(false);
                setQuery('');
            }}>
                  {option.label}
                </button>)}
            </For>
          </Show>
        </div>
      </FloatingPanel>
    </div>);
}
//# sourceMappingURL=TimezoneSelect.jsx.map