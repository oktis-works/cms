-- +migrate Up
-- Ciclo de vida de temas (correção do schema):
--  1. updated_at existia no service (install/activate/deactivate) mas não na
--     tabela — as rotas de ativar/desativar/instalar sempre falhavam.
--  2. Nome único (a descoberta por diretório faz upsert por name).
--  3. No máximo um tema ativo por tenant (NULL = global).
-- O tema mais recentemente ativado é mantido; os demais ACTIVE viram INACTIVE
-- antes de criar o índice único (bases antigas podem ter múltiplos ativos).

ALTER TABLE themes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
           ORDER BY activated_at DESC NULLS LAST, created_at DESC
         ) AS rn
  FROM themes
  WHERE status = 'ACTIVE'
)
UPDATE themes
SET status = 'INACTIVE', updated_at = NOW()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_themes_name_unique ON themes(name);
DROP INDEX IF EXISTS idx_themes_name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_themes_single_active
  ON themes((COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  WHERE status = 'ACTIVE';

-- +migrate Down
DROP INDEX IF EXISTS idx_themes_single_active;
DROP INDEX IF EXISTS idx_themes_name_unique;
CREATE INDEX IF NOT EXISTS idx_themes_name ON themes(name);
ALTER TABLE themes DROP COLUMN IF EXISTS updated_at;
