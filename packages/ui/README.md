# @oktis-works/ui

Admin UI component library — SolidJS components, design system, i18n.

## Components

### Layout

- `<Card>` — bordered container with header/body/footer slots
- `<Section>` — semantic section with title
- `<Grid>` / `<GridItem>` — responsive grid
- `<Flex>` — flexbox wrapper
- `<Container>` — max-width centered wrapper

### Forms

- `<Input>` — text, email, number, password, search
- `<Textarea>` — multi-line
- `<Select>` — single/multi select with search
- `<Checkbox>` / `<Radio>` / `<Switch>` — boolean/toggle
- `<DatePicker>` / `<TimePicker>` / `<DateTimePicker>`
- `<FileUpload>` — drag-drop + preview
- `<ColorPicker>`
- `<RichTextEditor>` — TipTap-based (blocks, marks)

### Data Display

- `<Table>` / `<TableColumn>` / `<TableRow>` — sortable, paginated
- `<List>` / `<ListItem>` — with actions
- `<Badge>` — status indicators
- `<Avatar>` — user/image with fallback
- `<Progress>` — linear/circular

### Feedback

- `<Alert>` — success/error/warning/info
- `<Toast>` — transient notifications
- `<Modal>` / `<Dialog>` — overlay with focus trap
- `<Popover>` / `<Tooltip>` — contextual
- `<Spinner>` / `<Skeleton>` — loading states

### Navigation

- `<Tabs>` / `<TabPanel>` — tabbed interface
- `<Breadcrumb>` / `<BreadcrumbItem>`
- `<Pagination>` — page numbers, prev/next
- `<Menu>` / `<MenuItem>` / `<SubMenu>` — nested

### Admin-Specific

- `<FieldRenderer>` — renders field by type (text, media, select, repeater, custom)
- `<FieldTypePicker>` — selects field type (loads plugin field types dynamically)
- `<RelationshipPicker>` — picks related content (modal with search)
- `<TaxonomyTermsManager>` — hierarchical term tree with drag-drop
- `<MediaLibrary>` — grid with upload, search, select
- `<ContentEditor>` — classic editor (title, slug, editor, sidebar)
- `<ContentList>` — table with filters, bulk actions
- `<ContentTypeWorkspace>` — CPT management
- `<ThemeCustomizer>` — live preview + settings
- `<PluginComponentHost>` — dynamic plugin component loader

## Design Tokens

```css
:root {
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --color-success: #16a34a;
  --color-warning: #f59e0b;
  --color-error: #dc2626;
  --color-bg: #ffffff;
  --color-surface: #f8fafc;
  --color-border: #e2e8f0;
  --color-text: #1e293b;
  --color-text-muted: #64748b;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  --font-sans: system-ui, -apple-system, sans-serif;
  --font-mono: ui-monospace, monospace;
}
```

## SolidJS Patterns

### Signals

```tsx
const [count, setCount] = createSignal(0);
const doubled = createMemo(() => count() * 2);
```

### Control Flow

```tsx
<Show when={condition} fallback={<Loading />}>
  <Content />
</Show>

<For each={items()}>
  {(item) => <Item key={item.id} data={item} />}
</For>
```

### Context

```tsx
const ThemeContext = createContext<Theme>();
<ThemeContext.Provider value={theme}>
  <App />
</ThemeContext.Provider>

const theme = useContext(ThemeContext);
```

## i18n

```tsx
import { useTranslation } from '../i18n';

const { t } = useTranslation();
<button>{t('settings.reading.save')}</button>
```

**Translation files:** `apps/admin/src/i18n/locales/{en,pt,es,fr,...}.json`

## Component Composition

```tsx
<Card>
  <Card.Header>Title</Card.Header>
  <Card.Body>
    <FieldRenderer field={field} values={data} onChange={onChange} />
  </Card.Body>
  <Card.Footer>
    <Button onClick={save}>Save</Button>
  </Card.Footer>
</Card>
```

## Styling

- **CSS Modules** — scoped styles per component
- **CSS Variables** — design tokens
- **No external CSS framework** — lightweight, custom
- **Dark mode** — via `data-theme="dark"` on `<html>`

## Phase 1 Integration

- `ContentEditor` — parent select dropdown in sidebar
- `ReadingSettings` — hub pages table + add/remove
- `FieldRenderer` — loads plugin field types via `FieldTypePicker`
- `FieldTypePicker` — dynamic import of plugin `adminComponentPath`

## Theming

- Light/dark via `data-theme` attribute
- Component CSS uses design tokens
- Override via custom theme manifest `settings`