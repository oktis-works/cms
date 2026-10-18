'use strict';

/**
 * mermaid-field - Plugin de campo customizado para diagramas Mermaid
 * 
 * O registro do field type é feito automaticamente via manifest.json
 * no bootstrap do plugin. Este arquivo pode conter hooks adicionais,
 * rotas, etc.
 */

module.exports.register = function register(api) {
  // O field type 'mermaid' já é registrado automaticamente via manifest.json
  // fieldTypes[] durante o bootstrap do plugin.

  // Exemplo: hook para processar o diagrama antes de salvar
  // api.registerHook('beforeContentCreate', async (context, payload) => {
  //   // Validar/transformar dados do campo mermaid se necessário
  // });

  // Exemplo: rota para preview do diagrama
  // api.registerRoutes([
  //   {
  //     method: 'POST',
  //     path: '/mermaid-field/preview',
  //     handler: async (ctx) => {
  //       const { code, theme } = await ctx.request.json();
  //       // Renderizar mermaid e retornar SVG
  //       return { ok: true, svg: '...' };
  //     }
  //   }
  // ]);
};