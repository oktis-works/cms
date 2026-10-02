// @oktis-works/cms - Shared DB bootstrap for commands

export async function initDb(): Promise<void> {
  const { loadConfig } = await import('@oktis-works/config');
  const { createConnection } = await import('@oktis-works/database');
  const config = loadConfig();
  createConnection(config.database);
}
