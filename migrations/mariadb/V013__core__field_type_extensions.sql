-- @okcms domain=core_schema provider=mariadb
-- V013__core__field_type_extensions.sql
-- Tabela para armazenar tipos de campo customizados registrados por plugins

CREATE TABLE IF NOT EXISTS field_type_extensions (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    plugin_name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL UNIQUE,
    label VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    icon VARCHAR(100) NOT NULL,
    supports_conditions BOOLEAN DEFAULT true,
    is_layout BOOLEAN DEFAULT false,
    admin_component_path VARCHAR(500),
    admin_renderer_path VARCHAR(500),
    config_schema JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índice para busca rápida por plugin
CREATE INDEX idx_field_type_extensions_plugin ON field_type_extensions(plugin_name);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_field_type_extensions_updated_at;
CREATE TRIGGER update_field_type_extensions_updated_at BEFORE UPDATE ON field_type_extensions FOR EACH ROW SET NEW.updated_at = CURRENT_TIMESTAMP;
