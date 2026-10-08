-- +migrate Up
-- Isolamento adicional para renderização pública de temas.
-- As tabelas já tinham RLS em instalações novas, mas bases antigas também
-- precisam de FORCE RLS e de políticas para as relações de taxonomia.

ALTER TABLE content ENABLE ROW LEVEL SECURITY;
ALTER TABLE content FORCE ROW LEVEL SECURITY;
ALTER TABLE media ENABLE ROW LEVEL SECURITY;
ALTER TABLE media FORCE ROW LEVEL SECURITY;
ALTER TABLE menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE menus FORCE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings FORCE ROW LEVEL SECURITY;
ALTER TABLE taxonomies ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxonomies FORCE ROW LEVEL SECURITY;
ALTER TABLE taxonomy_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxonomy_terms FORCE ROW LEVEL SECURITY;
ALTER TABLE content_taxonomy_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_taxonomy_terms FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'tenant_isolation_taxonomy_terms' AND tablename = 'taxonomy_terms'
  ) THEN
    CREATE POLICY tenant_isolation_taxonomy_terms ON taxonomy_terms
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid OR tenant_id IS NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'tenant_isolation_content_taxonomy_terms' AND tablename = 'content_taxonomy_terms'
  ) THEN
    CREATE POLICY tenant_isolation_content_taxonomy_terms ON content_taxonomy_terms
      USING (EXISTS (
        SELECT 1 FROM content c
        WHERE c.id = content_taxonomy_terms.content_id
          AND c.tenant_id = current_setting('app.current_tenant_id', true)::uuid
      ));
  END IF;
END $$;

-- +migrate Down
ALTER TABLE content NO FORCE ROW LEVEL SECURITY;
ALTER TABLE media NO FORCE ROW LEVEL SECURITY;
ALTER TABLE menus NO FORCE ROW LEVEL SECURITY;
ALTER TABLE settings NO FORCE ROW LEVEL SECURITY;
ALTER TABLE taxonomies NO FORCE ROW LEVEL SECURITY;
ALTER TABLE taxonomy_terms NO FORCE ROW LEVEL SECURITY;
ALTER TABLE content_taxonomy_terms NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_taxonomy_terms ON taxonomy_terms;
DROP POLICY IF EXISTS tenant_isolation_content_taxonomy_terms ON content_taxonomy_terms;
