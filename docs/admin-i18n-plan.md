# Plano Completo: Sistema de Idiomas (i18n) para Admin OkCMS

> **Objetivo**: Sistema simples, útil e profissional para internacionalizar 100% do admin (core + plugins + themes), com preferência do usuário salva no banco e arquivos de idioma em JSON.

---

## 1. Mapeamento Completo das Áreas do Admin

### 1.1 Layout & Navegação (compartilhado)
| Arquivo | Strings a traduzir |
|---------|-------------------|
| `DashboardLayout.astro` | "OkCMS", "Admin", "Dashboard", "Content", "Media", "Users", "Settings", "General", "Content Types", "Taxonomies", "Logout", "Quick Actions", "New Post", "Upload Media", "Add User", "Settings" |
| `BaseLayout.astro` | Meta tags, título da página |

### 1.2 Páginas Principais (Dashboard)
| Arquivo | Strings a traduzir |
|---------|-------------------|
| `index.astro` | "Dashboard", "Quick Actions", "New Post", "Upload Media", "Add User", "Settings" |
| `DashboardHome.tsx` | "Total Content", "Published", "Drafts", "Media Files", "Users", "Recent Content", "View All", "Title", "Type", "Status", "Updated", "Nenhum conteúdo ainda — crie o primeiro!" |

### 1.3 Content (Conteúdo)
| Arquivo | Strings a traduzir |
|---------|-------------------|
| `content/index.astro` | "Conteúdo", "Busque, filtre, edite e publique seu conteúdo." |
| `content/new.astro` | "Novo Conteúdo", "Crie novo conteúdo." |
| `content/edit.astro` | "Editar Conteúdo" |
| `ContentList.tsx` | "Título", "Tipo", "Status", "Atualizado", "Editar", "Publicar", "Despublicar", "Excluir", "Buscar conteúdo…", "Todos os tipos", "Todos os status", "+ Novo conteúdo", "Buscar", "Nenhum conteúdo encontrado.", "Rascunho", "Publicado", "Arquivado", "Conteúdo publicado ✓", "Conteúdo despublicado ✓", "Excluir \"{title}\"?" |
| `ContentEditor.tsx` | "Tipo", "Título", "Slug", "Resumo", "Imagem destacada (media ID)", "Status", "Rascunho", "Publicado", "Arquivado", "Layout", "Automático (hierarquia do tema)", "Campos personalizados", "Inspecionar tipos disponíveis", "Salvar", "Conteúdo salvo com sucesso." |

### 1.4 Media (Mídia)
| Arquivo | Strings a traduzir |
|---------|-------------------|
| `media/index.astro` | "Biblioteca de mídia", "Envie e gerencie imagens, vídeos e documentos. Os arquivos ficam em `uploads/` e são servidos publicamente." |
| `MediaLibrary.tsx` | "Arraste arquivos aqui", "Selecionar arquivos", "Enviando…", "Imagens, vídeos, áudios e documentos · até 25MB por arquivo", "Buscar por nome ou alt…", "Todos os tipos", "PNG", "JPEG", "GIF", "WebP", "SVG", "PDF", "MP4", "MP3", "Buscar", "Nenhum arquivo ainda. Envie o primeiro!", "Detalhes", "Arquivo", "Tipo", "Tamanho", "URL", "Copiar", "URL copiada ✓", "Não foi possível copiar a URL", "Texto alternativo (alt)", "Legenda", "Salvar detalhes", "Excluir", "Fechar", "Excluir \"{filename}\"? O arquivo será removido do disco.", "{ok} arquivo(s) enviado(s) ✓" |

### 1.5 Users (Usuários)
| Arquivo | Strings a traduzir |
|---------|-------------------|
| `users/index.astro` | "Usuários", "Gerencie contas, papéis (roles) e acessos do projeto." |
| `users/new.astro` | "Novo Usuário" |
| `UsersManager.tsx` | "Buscar por nome ou email…", "Todos os status", "Ativos", "Inativos", "+ Novo usuário", "Buscar", "Nome", "Email", "Papel", "Status", "Último acesso", "sem papel", "Gerenciar", "Excluir", "Nenhum usuário encontrado.", "Gerenciar usuário", "Nome", "Email", "Ativo", "Inativo", "Papel", "— sem papel —", "Criado em {date} · último acesso {date}", "Salvar", "Redefinir senha", "Fechar", "Nova senha para {email} (mínimo 8 caracteres):", "A senha precisa de pelo menos 8 caracteres", "Papel de {name} atualizado ✓", "Senha de {name} alterada ✓", "Usuário {name} salvo ✓", "Usuário {name} excluído ✓", "Excluir o usuário {email}?" |

### 1.6 Settings (Configurações)
| Arquivo | Strings a traduzir |
|---------|-------------------|
| `settings/index.astro` | "Configurações" |
| `settings/general.astro` | "Geral", "Informações básicas exibidas no site.", "← Todas as configurações" |
| `GeneralSettings.tsx` | "Título do site", "Meu Site", "Descrição", "Um novo site feito com OkCMS", "Idioma", "Fuso horário", "America/Sao_Paulo", "Configurações salvas ✓", "Carregando…", "Salvar" |
| `settings/post-types.astro` | "Content Types", "Crie tipos de conteúdo personalizados (CPTs) além de Posts e Páginas." |
| `PostTypesManager.tsx` | "Criar Content Type", "Slug (singular, ex.: portfolio)", "Apenas letras minúsculas, números e underscore", "Nome no singular", "Nome no plural", "Suporta", "Título", "Editor", "Imagem destacada", "Resumo", "Revisões", "Possui arquivo público (/slug)", "Criar", "Slug", "Singular", "Plural", "Origem", "Suporta", "Arquivo", "Remover", "ADMIN", "CORE", "Sim", "Não" |
| `settings/taxonomies.astro` | "Taxonomias", "Crie taxonomias personalizadas e vincule-as aos content types." |
| `TaxonomiesManager.tsx` | "Criar Taxonomia", "Nome (ex.: Gênero)", "Slug (opcional, gerado do nome)", "Apenas letras minúsculas, números e underscore", "Hierárquica (permite termos pai/filho)", "Vincular aos content types", "Criar", "Taxonomia", "Hierárquica", "Content types vinculados", "Sim", "Não", "Remover" |

### 1.7 Plugins (Extensões)
| Arquivo | Strings a traduzir |
|---------|-------------------|
| `plugins/[slug].astro` | "Plugin", "Conteúdo renderizado pelo runtime de componentes do plugin — isolado via `data-plugin=\"{pluginSlug}\"`." |
| `extensions.tsx` | (Strings dinâmicas vindas do manifest do plugin) |

### 1.8 Themes (Temas)
| Área | Strings a traduzir |
|------|-------------------|
| Theme settings (via `ACTIVE_THEME` e `theme:manage`) | "Tema ativo", "Instalar tema", "Temas disponíveis", "Tema instalado", "Tema ativo", "Desabilitar", "Habilitar", "Desinstalar", "Compilar tema" |
| `theme:build` CLI | "Compilando tema…", "Tema compilado ✓", "Erro ao compilar tema" |

### 1.9 Login & Auth
| Arquivo | Strings a traduzir |
|---------|-------------------|
| `login.astro` | "Login", "Sign in to your account", "Email", "Password", "Sign In" |

### 1.10 Componentes UI Compartilhados (@oktis-works/ui)
| Componente | Strings a traduzir |
|------------|-------------------|
| Button | "Loading…" (loading state) |
| Input/Select | Placeholders genéricos |
| Table | "No data" (emptyMessage) |
| Pagination | "Previous", "Next", "Page X of Y" |
| Badge | Variants: "success", "warning", "secondary", "danger" |
| Card | Sem strings fixas |
| Modal/Dialog | "Close", "Confirm", "Cancel" |

---

## 2. Arquitetura do Sistema i18n

### 2.1 Estrutura de Arquivos

```
apps/admin/
├── src/
│   ├── i18n/
│   │   ├── index.ts              # API principal (t(), useLocale, etc.)
│   │   ├── config.ts             # Config: idiomas suportados, fallback, namespace
│   │   ├── locale.ts             # Detecção/gerenciamento de locale do usuário
│   │   ├── loaders.ts            # Carregamento lazy de arquivos JSON
│   │   └── types.ts              # Tipos TypeScript
│   ├── locales/
│   │   ├── en.json               # Inglês (base/fallback)
│   │   ├── pt-BR.json            # Português Brasil
│   │   ├── es-ES.json            # Espanhol
│   │   └── [locale].json         # Outros idiomas
│   └── components/
│       └── LanguageSelector.tsx  # Seletor de idioma no header
```

### 2.2 Formato dos Arquivos de Idioma (JSON)

```json
{
  "layout": {
    "appName": "OkCMS",
    "admin": "Admin",
    "nav": {
      "dashboard": "Dashboard",
      "content": "Content",
      "media": "Media",
      "users": "Users",
      "settings": "Settings"
    },
    "actions": {
      "logout": "Logout",
      "newPost": "New Post",
      "uploadMedia": "Upload Media",
      "addUser": "Add User",
      "openSettings": "Settings"
    }
  },
  "dashboard": {
    "title": "Dashboard",
    "stats": {
      "totalContent": "Total Content",
      "published": "Published",
      "drafts": "Drafts",
      "mediaFiles": "Media Files",
      "users": "Users"
    },
    "recent": {
      "title": "Recent Content",
      "viewAll": "View All",
      "empty": "No content yet — create your first!",
      "columns": { "title": "Title", "type": "Type", "status": "Status", "updated": "Updated" }
    }
  },
  "content": {
    "list": {
      "title": "Content",
      "description": "Search, filter, edit and publish your content.",
      "columns": { "title": "Title", "type": "Type", "status": "Status", "updated": "Updated" },
      "actions": { "edit": "Edit", "publish": "Publish", "unpublish": "Unpublish", "delete": "Delete" },
      "filters": { "search": "Search content…", "allTypes": "All types", "allStatus": "All status" },
      "buttons": { "new": "+ New content", "search": "Search" },
      "empty": "No content found.",
      "statuses": { "draft": "Draft", "published": "Published", "archived": "Archived" },
      "confirmDelete": "Delete \"{title}\"?",
      "toasts": { "published": "Content published ✓", "unpublished": "Content unpublished ✓" }
    },
    "editor": {
      "type": "Type",
      "title": "Title",
      "slug": "Slug",
      "excerpt": "Excerpt",
      "featuredImage": "Featured Image (media ID)",
      "status": "Status",
      "statusOptions": { "draft": "Draft", "published": "Published", "archived": "Archived" },
      "layout": "Layout",
      "layoutAuto": "Automatic (theme hierarchy)",
      "customFields": "Custom Fields",
      "inspectTypes": "Inspect available types",
      "save": "Save",
      "saved": "Content saved successfully."
    }
  },
  "media": {
    "title": "Media Library",
    "description": "Upload and manage images, videos and documents. Files are stored in `uploads/` and served publicly.",
    "upload": {
      "dropzone": "Drop files here or",
      "select": "Select files",
      "uploading": "Uploading…",
      "hint": "Images, videos, audio and documents · up to 25MB per file"
    },
    "toolbar": { "search": "Search by name or alt…", "allTypes": "All types", "searchBtn": "Search" },
    "mimeTypes": { "png": "PNG", "jpeg": "JPEG", "gif": "GIF", "webp": "WebP", "svg": "SVG", "pdf": "PDF", "mp4": "MP4", "mp3": "MP3" },
    "empty": "No files yet. Upload the first one!",
    "details": {
      "title": "Details",
      "file": "File",
      "type": "Type",
      "size": "Size",
      "url": "URL",
      "copy": "Copy",
      "alt": "Alt text",
      "caption": "Caption",
      "save": "Save details",
      "delete": "Delete",
      "close": "Close",
      "confirmDelete": "Delete \"{filename}\"? The file will be removed from disk.",
      "saved": "Details saved ✓",
      "copied": "URL copied ✓",
      "copyError": "Could not copy URL"
    },
    "toasts": { "uploaded": "{count} file(s) uploaded ✓" }
  },
  "users": {
    "title": "Users",
    "description": "Manage accounts, roles and project access.",
    "new": "New User",
    "toolbar": { "search": "Search by name or email…", "allStatus": "All status", "active": "Active", "inactive": "Inactive", "newBtn": "+ New user", "searchBtn": "Search" },
    "table": { "name": "Name", "email": "Email", "role": "Role", "status": "Status", "lastAccess": "Last access", "actions": { "manage": "Manage", "delete": "Delete" } },
    "empty": "No users found.",
    "detail": {
      "title": "Manage user",
      "fields": { "name": "Name", "email": "Email", "status": "Status", "role": "Role" },
      "statusOptions": { "active": "Active", "inactive": "Inactive" },
      "rolePlaceholder": "— no role —",
      "meta": "Created on {created} · last access {lastAccess}",
      "actions": { "save": "Save", "resetPassword": "Reset password", "close": "Close" },
      "passwordPrompt": "New password for {email} (minimum 8 chars):",
      "passwordError": "Password must be at least 8 characters",
      "toasts": { "roleUpdated": "Role for {name} updated ✓", "passwordChanged": "Password for {name} changed ✓", "saved": "User {name} saved ✓", "deleted": "User {name} deleted ✓" },
      "confirmDelete": "Delete user {email}?"
    }
  },
  "settings": {
    "general": {
      "title": "General",
      "description": "Basic information displayed on the site.",
      "back": "← All settings",
      "fields": { "siteTitle": "Site Title", "siteTitlePlaceholder": "My Site", "siteDescription": "Description", "siteDescriptionPlaceholder": "A new site built with OkCMS", "language": "Language", "timezone": "Timezone", "timezonePlaceholder": "America/Sao_Paulo" },
      "saved": "Settings saved ✓",
      "loading": "Loading…",
      "save": "Save"
    },
    "postTypes": {
      "title": "Content Types",
      "description": "Create custom content types (CPTs) beyond Posts and Pages.",
      "form": {
        "title": "Create Content Type",
        "slug": "Slug (singular, e.g.: portfolio)",
        "slugHint": "Only lowercase letters, numbers and underscore",
        "singular": "Singular name",
        "plural": "Plural name",
        "supports": "Supports",
        "supportsOptions": { "title": "Title", "editor": "Editor", "thumbnail": "Featured Image", "excerpt": "Excerpt", "revisions": "Revisions" },
        "hasArchive": "Has public archive (/slug)",
        "create": "Create"
      },
      "table": { "slug": "Slug", "singular": "Singular", "plural": "Plural", "source": "Source", "supports": "Supports", "archive": "Archive", "actions": { "remove": "Remove" } },
      "sources": { "admin": "Admin", "core": "Core" }
    },
    "taxonomies": {
      "title": "Taxonomies",
      "description": "Create custom taxonomies and link them to content types.",
      "form": {
        "title": "Create Taxonomy",
        "name": "Name (e.g.: Genre)",
        "slug": "Slug (optional, generated from name)",
        "slugHint": "Only lowercase letters, numbers and underscore",
        "hierarchical": "Hierarchical (allows parent/child terms)",
        "attachTo": "Link to content types",
        "create": "Create"
      },
      "table": { "taxonomy": "Taxonomy", "hierarchical": "Hierarchical", "attachedTypes": "Linked content types", "actions": { "remove": "Remove" } }
    }
  },
  "login": {
    "title": "Login",
    "subtitle": "Sign in to your account",
    "email": "Email",
    "password": "Password",
    "submit": "Sign In"
  },
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "close": "Close",
    "confirm": "Confirm",
    "loading": "Loading…",
    "yes": "Yes",
    "no": "No",
    "search": "Search",
    "filter": "Filter",
    "create": "Create",
    "update": "Update",
    "remove": "Remove",
    "viewAll": "View All",
    "back": "Back",
    "next": "Next",
    "previous": "Previous",
    "page": "Page",
    "of": "of",
    "items": "items",
    "item": "item",
    "empty": "No {items} found.",
    "toast": { "success": "✓", "error": "Error: {message}" },
    "status": { "active": "Active", "inactive": "Inactive", "draft": "Draft", "published": "Published", "archived": "Archived" }
  }
}
```

---

## 3. API Principal (src/i18n/index.ts)

```typescript
// apps/admin/src/i18n/index.ts

import type { Locale, TranslationMap, TFunction, LocaleConfig } from './types';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, FALLBACK_LOCALE } from './config';
import { loadLocale } from './loaders';
import { getUserLocale, setUserLocale, getBrowserLocale } from './locale';

// Cache de traduções carregadas
const translationCache = new Map<Locale, TranslationMap>();

/** Carrega traduções para um locale (com cache) */
export async function loadTranslations(locale: Locale): Promise<TranslationMap> {
  if (translationCache.has(locale)) return translationCache.get(locale)!;
  
  const translations = await loadLocale(locale);
  translationCache.set(locale, translations);
  return translations;
}

/** Função de tradução principal */
export async function createTFunction(locale: Locale): Promise<TFunction> {
  const translations = await loadTranslations(locale);
  const fallback = await loadTranslations(FALLBACK_LOCALE);
  
  return function t(key: string, params?: Record<string, string | number>): string {
    const keys = key.split('.');
    let value: unknown = translations;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        // Fallback para inglês
        value = fallback;
        for (const k of keys) {
          if (value && typeof value === 'object' && k in value) {
            value = (value as Record<string, unknown>)[k];
          } else {
            return key; // Chave não encontrada
          }
        }
        break;
      }
    }
    
    if (typeof value !== 'string') return key;
    
    // Interpolação simples: {param} → valor
    if (params) {
      return value.replace(/\{(\w+)\}/g, (_, param) => String(params[param] ?? ''));
    }
    
    return value;
  };
}

/** Hook React/Solid para usar traduções */
export function useTranslation(locale?: Locale) {
  const currentLocale = locale ?? getUserLocale() ?? getBrowserLocale() ?? DEFAULT_LOCALE;
  const [t, setT] = createSignal<TFunction>(() => key => key);
  
  onMount(async () => {
    const fn = await createTFunction(currentLocale);
    setT(fn);
  });
  
  const changeLocale = async (newLocale: Locale) => {
    await setUserLocale(newLocale); // Salva no banco + cookie
    const fn = await createTFunction(newLocale);
    setT(fn);
  };
  
  return { t, locale: currentLocale, changeLocale };
}

/** Carrega traduções para uso em Astro (server-side) */
export async function getTranslationsForAstro(locale: Locale): Promise<TranslationMap> {
  return loadTranslations(locale);
}
```

---

## 4. Persistência da Preferência do Usuário

### 4.1 Banco de Dados

```sql
-- Adicionar coluna à tabela users
ALTER TABLE users ADD COLUMN locale VARCHAR(10) DEFAULT 'pt-BR';
```

### 4.2 API de Locale do Usuário

```typescript
// apps/api/src/routes/users/index.ts - adicionar endpoints

// GET /api/v1/users/me/locale
authRouter.get('/me/locale', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const sql = getConnection();
  const rows = await sql.unsafe('SELECT locale FROM users WHERE id = $1', [userId]);
  return c.json({ locale: rows[0]?.locale ?? 'pt-BR' });
});

// PUT /api/v1/users/me/locale
authRouter.put('/me/locale', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const { locale } = await c.req.json();
  
  if (!SUPPORTED_LOCALES.includes(locale)) {
    return c.json({ error: 'Unsupported locale' }, 400);
  }
  
  const sql = getConnection();
  await sql.unsafe('UPDATE users SET locale = $1 WHERE id = $2', [locale, userId]);
  return c.json({ success: true, locale });
});
```

### 4.3 Client-side (lib/api.ts)

```typescript
// Adicionar ao ApiClient
async getUserLocale(): Promise<string> {
  const res = await this.request('GET', '/api/v1/users/me/locale');
  return res.locale;
}

async setUserLocale(locale: string): Promise<void> {
  await this.request('PUT', '/api/v1/users/me/locale', { locale });
}
```

---

## 5. Integração no Admin (Astro + Solid)

### 5.1 Middleware Astro para Locale

```typescript
// apps/admin/src/middleware/i18n.ts
import { defineMiddleware } from 'astro:middleware';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '../i18n/config';
import { getTranslationsForAstro } from '../i18n';

export const i18nMiddleware = defineMiddleware(async (context, next) => {
  // 1. Tentar obter do cookie
  const cookieLocale = context.cookies.get('admin_locale')?.value;
  
  // 2. Tentar obter do usuário logado (via API)
  let userLocale: string | null = null;
  try {
    const res = await fetch(`${import.meta.env.PUBLIC_API_URL}/api/v1/users/me/locale`, {
      credentials: 'include',
      headers: { Cookie: context.request.headers.get('Cookie') ?? '' }
    });
    if (res.ok) userLocale = (await res.json()).locale;
  } catch {}
  
  // 3. Accept-Language header
  const acceptLang = context.request.headers.get('Accept-Language');
  const browserLocale = acceptLang?.split(',')[0]?.split('-')[0] ?? DEFAULT_LOCALE;
  
  // Resolver locale final
  const locale = (cookieLocale ?? userLocale ?? browserLocale) as Locale;
  const validLocale = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  
  // Carregar traduções para uso nas páginas Astro
  const translations = await getTranslationsForAstro(validLocale);
  context.locals.t = createTFunctionFromMap(translations);
  context.locals.locale = validLocale;
  
  return next();
});

function createTFunctionFromMap(map: TranslationMap) {
  return (key: string, params?: Record<string, string | number>) => {
    const keys = key.split('.');
    let value: unknown = map;
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else return key;
    }
    if (typeof value !== 'string') return key;
    if (params) return value.replace(/\{(\w+)\}/g, (_, p) => String(params[p] ?? ''));
    return value;
  };
}
```

### 5.2 Uso em Páginas Astro

```astro
---
// apps/admin/src/pages/content/index.astro
import DashboardLayout from '../../layouts/DashboardLayout.astro';
import { ContentList } from '../../components/content/ContentList';

const { t, locale } = Astro.locals;
---

<DashboardLayout title={t('content.list.title')}>
  <div class="content-page">
    <div class="page-header">
      <h2>{t('content.list.title')}</h2>
      <p>{t('content.list.description')}</p>
    </div>
    <ContentList client:load locale={locale} />
  </div>
</DashboardLayout>
```

### 5.3 Uso em Componentes Solid (TSX)

```tsx
// apps/admin/src/components/content/ContentList.tsx
import { createSignal, onMount } from 'solid-js';
import { useTranslation } from '../../i18n';

export function ContentList(props: { locale?: string }) {
  const { t, locale, changeLocale } = useTranslation(props.locale);
  
  // ... resto do componente
  
  return (
    <div class="content-list">
      <Show when={error()}>
        <div class="notice notice--error">{error()}</div>
      </Show>
      
      <div class="toolbar">
        <Input
          placeholder={t('content.list.filters.search')}
          // ...
        />
        <Select
          placeholder={t('content.list.filters.allTypes')}
          // ...
        />
        <a class="btn btn-primary" href="/content/new">
          {t('content.list.buttons.new')}
        </a>
      </div>
      
      <Card>
        <Table
          columns={[
            { key: 'title', label: t('content.list.columns.title') },
            { key: 'type', label: t('content.list.columns.type') },
            { key: 'status', label: t('content.list.columns.status') },
            { key: 'updated_at', label: t('content.list.columns.updated') },
            {
              key: 'actions',
              label: '',
              render: (_value, row) => (
                <div class="actions">
                  <a class="btn btn-secondary btn-sm">
                    {t('content.list.actions.edit')}
                  </a>
                  <Button variant={isPublished ? 'secondary' : 'primary'}>
                    {isPublished 
                      ? t('content.list.actions.unpublish') 
                      : t('content.list.actions.publish')}
                  </Button>
                  <Button variant="danger">
                    {t('content.list.actions.delete')}
                  </Button>
                </div>
              )
            }
          ]}
          emptyMessage={t('content.list.empty')}
        />
      </Card>
    </div>
  );
}
```

---

## 6. Sistema para Plugins e Temas

### 6.1 Estrutura de Idiomas para Extensões

```
plugins/meu-plugin/
├── manifest.json
├── index.js
└── locales/
    ├── en.json
    ├── pt-BR.json
    └── es-ES.json

themes/meu-tema/
├── theme.json
├── templates/
└── locales/
    ├── en.json
    ├── pt-BR.json
    └── es-ES.json
```

### 6.2 Manifest do Plugin com i18n

```json
// plugins/meu-plugin/manifest.json
{
  "name": "meu-plugin",
  "version": "0.1.0",
  "description": "Meu plugin",
  "main": "index.js",
  "type": "plugin",
  "i18n": {
    "defaultLocale": "en",
    "locales": ["en", "pt-BR", "es-ES"],
    "namespace": "plugins.meu-plugin"
  }
}
```

### 6.3 Carregamento Automático de Traduções de Plugins

```typescript
// apps/admin/src/i18n/loaders.ts

interface PluginLocaleInfo {
  slug: string;
  namespace: string;
  defaultLocale: string;
  locales: string[];
  translations: Record<string, TranslationMap>;
}

const pluginTranslationsCache = new Map<string, PluginLocaleInfo>();

/** Carrega traduções de um plugin instalado */
export async function loadPluginTranslations(pluginSlug: string): Promise<PluginLocaleInfo | null> {
  if (pluginTranslationsCache.has(pluginSlug)) return pluginTranslationsCache.get(pluginSlug)!;
  
  try {
    // Tentar carregar do manifest do plugin
    const manifestResponse = await fetch(`/plugins/${pluginSlug}/manifest.json`, { credentials: 'include' });
    if (!manifestResponse.ok) return null;
    const manifest = await manifestResponse.json();
    
    if (!manifest.i18n) return null;
    
    const translations: Record<string, TranslationMap> = {};
    for (const locale of manifest.i18n.locales) {
      try {
        const res = await fetch(`/plugins/${pluginSlug}/locales/${locale}.json`, { credentials: 'include' });
        if (res.ok) translations[locale] = await res.json();
      } catch {}
    }
    
    const info: PluginLocaleInfo = {
      slug: pluginSlug,
      namespace: manifest.i18n.namespace,
      defaultLocale: manifest.i18n.defaultLocale,
      locales: manifest.i18n.locales,
      translations
    };
    
    pluginTranslationsCache.set(pluginSlug, info);
    return info;
  } catch {
    return null;
  }
}

/** Mergeia traduções de plugins no mapa principal */
export async function mergePluginTranslations(
  mainTranslations: TranslationMap,
  userLocale: string
): Promise<TranslationMap> {
  // Buscar plugins ativos
  const res = await fetch('/api/v1/plugins', { credentials: 'include' });
  if (!res.ok) return mainTranslations;
  
  const plugins = await res.json();
  
  for (const plugin of plugins) {
    if (plugin.status !== 'ACTIVE') continue;
    const pluginLocale = await loadPluginTranslations(plugin.slug ?? plugin.name);
    if (!pluginLocale) continue;
    
    // Merge namespace do plugin
    const localeToUse = pluginLocale.translations[userLocale] 
      ? userLocale 
      : pluginLocale.defaultLocale;
    const pluginMap = pluginLocale.translations[localeToUse];
    if (!pluginMap) continue;
    
    // Adicionar sob namespace do plugin
    (mainTranslations as Record<string, unknown>)[pluginLocale.namespace] = pluginMap;
  }
  
  return mainTranslations;
}
```

### 6.4 API para Plugins Acessarem i18n

```typescript
// packages/plugin-sdk/src/i18n.ts (NOVO ARQUIVO)

export interface PluginI18nAPI {
  /** Traduz chave no namespace do plugin */
  t: (key: string, params?: Record<string, string | number>) => string;
  
  /** Locale atual do admin */
  locale: string;
  
  /** Lista de locales suportados pelo plugin */
  supportedLocales: string[];
  
  /** Muda locale (dispara reload no admin) */
  changeLocale: (locale: string) => void;
  
  /** Registra traduções do plugin (chamado no register) */
  registerTranslations: (translations: Record<string, TranslationMap>) => void;
}

/** Cria API de i18n para um plugin */
export function createPluginI18n(pluginSlug: string, manifest: PluginManifest): PluginI18nAPI {
  const namespace = manifest.i18n?.namespace ?? `plugins.${pluginSlug}`;
  const defaultLocale = manifest.i18n?.defaultLocale ?? 'en';
  const supportedLocales = manifest.i18n?.locales ?? ['en'];
  
  let currentLocale = defaultLocale;
  let translations: Record<string, TranslationMap> = {};
  
  return {
    get t() {
      return (key: string, params?: Record<string, string | number>) => {
        const fullKey = `${namespace}.${key}`;
        // Delega para o sistema global do admin
        return window.__OKCMS_I18N__?.t?.(fullKey, params) ?? key;
      };
    },
    get locale() { return currentLocale; },
    get supportedLocales() { return supportedLocales; },
    changeLocale: (locale) => { currentLocale = locale; },
    registerTranslations: (trans) => { translations = trans; }
  };
}

// Disponibilizar globalmente para plugins
declare global {
  interface Window {
    __OKCMS_I18N__: {
      t: (key: string, params?: Record<string, string | number>) => string;
      locale: string;
      changeLocale: (locale: string) => void;
      registerPluginTranslations: (namespace: string, translations: Record<string, TranslationMap>) => void;
    };
  }
}
```

### 6.5 Exemplo de Uso em Plugin

```javascript
// plugins/meu-plugin/index.js
'use strict';

module.exports.register = function register(registry) {
  // Registrar traduções do plugin
  registry.addFilter('admin:i18n:register', (i18n) => {
    // Carregar arquivos de idioma do plugin
    const fs = require('fs');
    const path = require('path');
    
    const localesDir = path.join(__dirname, 'locales');
    const translations = {};
    
    for (const file of fs.readdirSync(localesDir)) {
      if (file.endsWith('.json')) {
        const locale = file.replace('.json', '');
        translations[locale] = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf-8'));
      }
    }
    
    // Registrar no sistema global
    if (window.__OKCMS_I18N__) {
      window.__OKCMS_I18N__.registerPluginTranslations('plugins.meu-plugin', translations);
    }
    
    return i18n;
  });
  
  // Usar traduções no componente do plugin
  registry.addComponent('meu-plugin:dashboard-widget', {
    render: (props) => {
      const t = props.i18n?.t ?? (key => key);
      return (
        <div class="widget">
          <h3>{t('widget.title')}</h3>
          <p>{t('widget.description')}</p>
        </div>
      );
    }
  });
};
```

---

## 7. Seletor de Idioma no Header

```tsx
// apps/admin/src/components/LanguageSelector.tsx
import { createSignal } from 'solid-js';
import { useTranslation } from '../i18n';
import { SUPPORTED_LOCALES, LOCALE_LABELS } from '../i18n/config';

const LOCALE_LABELS: Record<string, string> = {
  'pt-BR': 'Português (BR)',
  'en': 'English',
  'es-ES': 'Español'
};

export function LanguageSelector() {
  const { locale, changeLocale } = useTranslation();
  const [open, setOpen] = createSignal(false);
  
  return (
    <div class="language-selector" onMouseLeave={() => setOpen(false)}>
      <button 
        class="btn btn-secondary btn-sm"
        onClick={() => setOpen(!open())}
        aria-expanded={open()}
        aria-label={t('common.language')}
      >
        <span class="flag">{getFlag(locale())}</span>
        <span>{LOCALE_LABELS[locale()] ?? locale()}</span>
        <svg class="chevron" width="16" height="16" viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" fill="none"/>
        </svg>
      </button>
      
      <Show when={open()}>
        <ul class="language-dropdown" role="menu">
          {SUPPORTED_LOCALES.map((loc) => (
            <li key={loc} role="menuitem">
              <button
                class={locale() === loc ? 'active' : ''}
                onClick={() => { changeLocale(loc); setOpen(false); }}
              >
                <span class="flag">{getFlag(loc)}</span>
                {LOCALE_LABELS[loc] ?? loc}
              </button>
            </li>
          ))}
        </ul>
      </Show>
    </div>
  );
}

function getFlag(locale: string): string {
  const flags: Record<string, string> = {
    'pt-BR': '🇧🇷',
    'en': '🇺🇸',
    'es-ES': '🇪🇸'
  };
  return flags[locale] ?? '🌐';
}
```

### 6.6 Integração no DashboardLayout

```astro
---
// apps/admin/src/layouts/DashboardLayout.astro
import BaseLayout from './BaseLayout.astro';
import { PluginExtensionsSlot } from '../ext/extensions';
import { LanguageSelector } from '../components/LanguageSelector';

const { title, description } = Astro.props;
const { locale, t } = Astro.locals;
---

<BaseLayout title={title} description={description}>
  <div class="layout">
    <aside class="sidebar">
      <!-- ... nav existente ... -->
    </aside>
    
    <main class="main-content">
      <header class="main-header">
        <h1 class="text-lg font-bold">{title}</h1>
        <div class="header-actions">
          <LanguageSelector client:load locale={locale} />
          <button class="btn btn-secondary btn-sm" id="logout-btn">
            {t('layout.actions.logout')}
          </button>
        </div>
      </header>
      <div class="content">
        <slot />
      </div>
    </main>
  </div>
</BaseLayout>
```

---

## 8. Configuração (src/i18n/config.ts)

```typescript
// apps/admin/src/i18n/config.ts

export type Locale = 'pt-BR' | 'en' | 'es-ES';

export const SUPPORTED_LOCALES: Locale[] = ['pt-BR', 'en', 'es-ES'];
export const DEFAULT_LOCALE: Locale = 'pt-BR';
export const FALLBACK_LOCALE: Locale = 'en';

export const LOCALE_LABELS: Record<Locale, string> = {
  'pt-BR': 'Português (Brasil)',
  'en': 'English',
  'es-ES': 'Español'
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  'pt-BR': '🇧🇷',
  'en': '🇺🇸',
  'es-ES': '🇪🇸'
};

export const NAMESPACE_PREFIX = 'admin';

export function isValidLocale(locale: string): locale is Locale {
  return SUPPORTED_LOCALES.includes(locale as Locale);
}
```

---

## 9. Carregamento Lazy (src/i18n/loaders.ts)

```typescript
// apps/admin/src/i18n/loaders.ts
import type { Locale, TranslationMap } from './types';
import { SUPPORTED_LOCALES } from './config';

const localeCache = new Map<Locale, TranslationMap>();

/** Carrega arquivo JSON de locale */
export async function loadLocale(locale: Locale): Promise<TranslationMap> {
  if (localeCache.has(locale)) return localeCache.get(locale)!;
  
  try {
    // Em desenvolvimento: import dinâmico
    // Em produção: fetch do arquivo estático
    const module = await import(`../locales/${locale}.json`);
    const translations = module.default ?? module;
    localeCache.set(locale, translations);
    return translations;
  } catch {
    // Fallback para inglês
    if (locale !== 'en') return loadLocale('en');
    return {};
  }
}

/** Pré-carrega todos os locales (para build) */
export async function preloadAllLocales(): Promise<void> {
  await Promise.all(SUPPORTED_LOCALES.map(loadLocale));
}

/** Limpa cache (útil para testes ou mudança de locale) */
export function clearLocaleCache(): void {
  localeCache.clear();
}
```

---

## 10. Tipos TypeScript (src/i18n/types.ts)

```typescript
// apps/admin/src/i18n/types.ts

export type Locale = 'pt-BR' | 'en' | 'es-ES';

export interface TranslationMap {
  [key: string]: string | TranslationMap;
}

export interface TFunction {
  (key: string, params?: Record<string, string | number>): string;
}

export interface LocaleConfig {
  supportedLocales: Locale[];
  defaultLocale: Locale;
  fallbackLocale: Locale;
}

export interface UseTranslationReturn {
  t: TFunction;
  locale: Locale;
  changeLocale: (locale: Locale) => Promise<void>;
}

export interface PluginI18nManifest {
  defaultLocale: Locale;
  locales: Locale[];
  namespace: string;
}
```

---

## 11. Integração com @oktis-works/ui (Design System)

### 11.1 Props de Locale nos Componentes UI

```typescript
// packages/ui/src/components/Button.tsx
interface ButtonProps {
  // ... props existentes
  locale?: string; // Para labels de loading, etc.
  loadingText?: string; // ou usar t('common.loading')
}

// Uso interno
const t = useTranslation(props.locale);
const loadingLabel = props.loadingText ?? t('common.loading');
```

### 11.2 Provider de Locale (Context)

```tsx
// packages/ui/src/LocaleProvider.tsx
import { createContext, useContext } from 'solid-js';
import type { Locale, TFunction } from '@oktis-works/admin/i18n';

interface LocaleContextValue {
  locale: Locale;
  t: TFunction;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider(props: { children: JSX.Element; locale: Locale; t: TFunction }) {
  return <LocaleContext.Provider value={{ locale: props.locale, t: props.t }}>{props.children}</LocaleContext.Provider>;
}

export function useLocaleContext(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocaleContext must be used within LocaleProvider');
  return ctx;
}
```

---

## 12. Build & Deploy

### 12.1 Script de Build de Locales

```json
// package.json do admin
{
  "scripts": {
    "build:locales": "node scripts/build-locales.js",
    "i18n:extract": "node scripts/extract-strings.js",
    "i18n:validate": "node scripts/validate-locales.js"
  }
}
```

### 12.2 Extração Automática de Strings

```javascript
// scripts/extract-strings.js
// Percorre todos os arquivos .astro, .tsx, .ts do admin
// Extrai chamadas t('chave') e t('chave', { param })
// Gera/atualiza en.json como base
// Mantém chaves existentes nos outros idiomas
```

### 12.3 Validação de Completude

```javascript
// scripts/validate-locales.js
// Compara chaves entre en.json (base) e outros idiomas
// Reporta chaves faltando
// Falha no CI se houver chaves não traduzidas obrigatórias
```

---

## 13. Migração Gradual (Estratégia)

### Fase 1: Core + Layout (Semana 1)
- [ ] Criar infraestrutura i18n (config, loaders, types, API)
- [ ] Criar en.json base com todas as strings do layout
- [ ] Criar pt-BR.json e es-ES.json
- [ ] Integrar no DashboardLayout + LanguageSelector
- [ ] Adicionar coluna `locale` em `users` + endpoints API

### Fase 2: Páginas Principais (Semana 2)
- [ ] Dashboard (DashboardHome)
- [ ] Content (List + Editor)
- [ ] Media Library
- [ ] Users Manager

### Fase 3: Settings (Semana 3)
- [ ] General
- [ ] Post Types
- [ ] Taxonomies

### Fase 4: Plugins & Temas (Semana 4)
- [ ] Sistema de carregamento de traduções de plugins
- [ ] API no plugin-sdk
- [ ] Documentação para desenvolvedores de plugins
- [ ] Exemplo de plugin com i18n

### Fase 5: Validação & Polish (Semana 5)
- [ ] Scripts de extração/validação
- [ ] Testes de integração
- [ ] Documentação final
- [ ] Release

---

## 14. Decisões de Design

| Decisão | Justificativa |
|---------|---------------|
| JSON por locale (não banco) | Performance, versionamento no git, facilita PRs de tradução, build-time optimization |
| Namespace por feature (`content.list`, `media.details`) | Organização, evita colisões, tree-shaking possível |
| Interpolação `{param}` simples | Suficiente para 95% dos casos, zero dependências |
| Fallback para inglês | Garante que nada quebre se tradução faltar |
| Locale do usuário no banco | Persiste entre sessões/dispositivos, multi-tenant nativo |
| Plugin carrega próprio locale | Isolamento, plugins podem shipar suas traduções, hot-reload possível |
| Detecção: cookie → user → browser → default | Prioriza escolha explícita do usuário |

---

## 15. Estimativa de Esforço

| Item | Arquivos | Strings ~ | Esforço |
|------|----------|-----------|---------|
| Infraestrutura i18n | 5 | - | 8h |
| Layout + Login | 3 | ~30 | 4h |
| Dashboard | 2 | ~20 | 3h |
| Content (List + Editor) | 5 | ~80 | 8h |
| Media Library | 1 | ~50 | 6h |
| Users | 2 | ~60 | 6h |
| Settings (3 páginas) | 6 | ~100 | 10h |
| Plugin/Theme system | 4 | - | 12h |
| Scripts (extract/validate) | 3 | - | 8h |
| Testes & Documentação | - | - | 8h |
| **Total** | **~31** | **~340** | **~73h** |

---

## 16. Próximos Passos Imediatos

1. **Aprovar este plano** com o time
2. **Criar branch** `feat/admin-i18n`
3. **Implementar Fase 1** (infraestrutura + layout)
4. **Code review** da arquitetura base
5. **Paralelizar** Fases 2-3 entre devs
6. **Fase 4** requer coordenação com plugin-sdk

---

> **Nota**: Este plano mantém compatibilidade total com plugins existentes — eles continuam funcionando sem mudanças. O sistema de i18n de plugins é **opcional** e **aditivo**.