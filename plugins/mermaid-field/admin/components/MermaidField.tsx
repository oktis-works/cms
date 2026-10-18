// @oktis-works/mermaid-field - Componente de configuração do campo Mermaid
// Usado no admin: /settings/custom-fields/new ou /edit

import { createSignal, onMount } from 'solid-js';
import { Card, Select, Textarea, Switch, Label } from '@oktis-works/ui';

export default function MermaidFieldConfig(props) {
  const { config, schema, onChange, t } = props;

  const [theme, setTheme] = createSignal(config.theme ?? 'default');
  const [editable, setEditable] = createSignal(config.editable ?? true);
  const [diagramCode, setDiagramCode] = createSignal(config.diagramCode ?? '');

  const themeOptions = [
    { value: 'default', label: 'Default (claro)' },
    { value: 'dark', label: 'Dark (escuro)' },
    { value: 'forest', label: 'Forest (verde)' },
    { value: 'neutral', label: 'Neutro (cinza)' },
  ];

  const emitChange = () => {
    onChange({
      config: {
        theme: theme(),
        editable: editable(),
        diagramCode: diagramCode(),
      },
    });
  };

  return (
    <Card class="mermaid-field-config">
      <div class="config-section">
        <h4>{t('settings.customFields.mermaid.diagramSettings') ?? 'Configurações do Diagrama'}</h4>

        <div class="config-row">
          <Label>{t('settings.customFields.mermaid.theme') ?? 'Tema'}</Label>
          <Select
            value={theme()}
            onChange={(v) => { setTheme(v); emitChange(); }}
            options={themeOptions}
            placeholder={t('settings.customFields.mermaid.selectTheme') ?? 'Selecione um tema'}
          />
        </div>

        <div class="config-row">
          <Switch
            checked={editable()}
            onChange={(e) => { setEditable(e.currentTarget.checked); emitChange(); }}
            label={t('settings.customFields.mermaid.editable') ?? 'Permitir edição do diagrama no editor de conteúdo'}
          />
        </div>
      </div>

      <div class="config-section">
        <Label>{t('settings.customFields.mermaid.defaultCode') ?? 'Código Mermaid Padrão'}</Label>
        <p class="muted">{t('settings.customFields.mermaid.defaultCodeHint') ?? 'Código inicial quando o campo for adicionado a um conteúdo. O usuário poderá editar depois.'}</p>
        <Textarea
          value={diagramCode()}
          onInput={(e) => { setDiagramCode(e.currentTarget.value); emitChange(); }}
          rows={12}
          placeholder="graph TD\n  A[Início] --> B[Processo]\n  B --> C[Fim]"
          class="mermaid-code-editor"
          spellcheck={false}
        />
        <details class="mermaid-examples">
          <summary>{t('settings.customFields.mermaid.examples') ?? 'Exemplos'}</summary>
          <div class="example-buttons">
            <button type="button" class="btn btn-sm" onClick={() => {
              setDiagramCode(`graph TD
  A[Início] --> B{Decisão}
  B -->|Sim| C[Ação 1]
  B -->|Não| D[Ação 2]
  C --> E[Fim]
  D --> E`);
              emitChange();
            }}>
              {t('settings.customFields.mermaid.exampleFlowchart') ?? 'Fluxograma'}
            </button>
            <button type="button" class="btn btn-sm" onClick={() => {
              setDiagramCode(`sequenceDiagram
  participant A as Alice
  participant B as Bob
  A->>B: Olá Bob!
  B-->>A: Oi Alice!
`);
              emitChange();
            }}>
              {t('settings.customFields.mermaid.exampleSequence') ?? 'Sequência'}
            </button>
            <button type="button" class="btn btn-sm" onClick={() => {
              setDiagramCode(`classDiagram
  class Animal {
    +String nome
    +int idade
    +fazerSom()
  }
  class Cachorro {
    +String raca
    +latir()
  }
  Animal <|-- Cachorro
`);
              emitChange();
            }}>
              {t('settings.customFields.mermaid.exampleClass') ?? 'Classes'}
            </button>
          </div>
        </details>
      </div>
    </Card>
  );
}