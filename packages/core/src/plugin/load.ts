// @oktis-works/core - Sincronização de plugins habilitados em runtime
//
// O PLUGIN.md promete que `register(registry)` é chamado quando o plugin é
// carregado — aqui o core cumpre isso para todos os processos (API, web,
// worker, dev): lê os plugins com status ACTIVATED/RUNNING no banco, importa
// o entrypoint e registra os hooks no registry compartilhado.
//
// Nunca lança: falha de banco, diretório ausente ou plugin quebrado são
// reportadas no resultado, sem derrubar o boot.

import { bootstrapPlugins, type PluginBootstrapResult } from '@oktis-works/plugin-runtime';
import { getConnection } from '@oktis-works/database';
import { resolveExtensionDirectory } from '../extensions/project-directories.js';

/**
 * Sincroniza o registry de hooks com os plugins habilitados no banco.
 * Idempotente: pode ser chamada no boot e depois de ativar/desativar um
 * plugin pela API (reflete no processo na hora; web/worker no próximo restart).
 */
export async function syncEnabledPlugins(): Promise<PluginBootstrapResult> {
  try {
    return await bootstrapPlugins({
      pluginsDir: resolveExtensionDirectory('plugin'),
      sql: getConnection(),
    });
  } catch (error) {
    console.warn(
      `[plugins] sync indisponível: ${error instanceof Error ? error.message : String(error)}`
    );
    return { enabled: [], loaded: [], unloaded: [], failed: [] };
  }
}
