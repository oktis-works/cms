-- V013__core__field_type_extensions.sql
-- Tabela para armazenar tipos de campo customizados registrados por plugins

CREATE TABLE IF NOT EXISTS field_type_extensions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL UNIQUE,
    label VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    icon VARCHAR(100) NOT NULL,
    supports_conditions BOOLEAN DEFAULT true,
    is_layout BOOLEAN DEFAULT false,
    admin_component_path VARCHAR(500),
    admin_renderer_path VARCHAR(500),
    config_schema JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para busca rápida por plugin
CREATE INDEX IF NOT EXISTS idx_field_type_extensions_plugin ON field_type_extensions(plugin_name);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_field_type_extensions_updated_at ON field_type_extensions;
CREATE TRIGGER update_field_type_extensions_updated_at
    BEFORE UPDATE ON field_type_extensions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();