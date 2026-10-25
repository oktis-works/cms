-- @okcms domain=core_schema provider=postgres
-- +migrate Up
-- CORE type "page": labels devem ser em inglês (alinhado ao seed V003 e ao
-- CORE_TYPES do core). Só corrige quando ainda estão nos defaults em português,
-- para não sobrescrever edições intencionais feitas pelo admin.
UPDATE content_types
SET name = 'Page',
    plural_label = 'Pages',
    singular_label = 'Page',
    updated_at = NOW()
WHERE slug = 'page'
  AND source = 'CORE'
  AND (plural_label = 'Páginas' OR singular_label = 'Página');

-- +migrate Down
-- Sem rollback automático: os labels são dados; restaure manualmente se necessário.
