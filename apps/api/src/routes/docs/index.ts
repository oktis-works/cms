// @oktis-works/api - OpenAPI 3.1 document (rest-api-004 / maintainability-003)

import { Hono } from 'hono';
import { CMS_VERSION } from '@oktis-works/validation';

const router = new Hono();

const RESOURCES = [
  ['auth', 'Autenticação e sessões'],
  ['users', 'Usuários'],
  ['tenants', 'Tenants (multi-tenant isolation)'],
  ['roles', 'Papéis e permissões (RBAC)'],
  ['media', 'Biblioteca de mídia'],
  ['content', 'Conteúdo polimórfico'],
  ['posts', 'Posts'],
  ['pages', 'Páginas'],
  ['categories', 'Categorias'],
  ['tags', 'Tags'],
  ['menus', 'Menus de navegação'],
  ['settings', 'Configurações agrupadas'],
  ['plugins', 'Plugins — ciclo de vida'],
  ['themes', 'Temas — ciclo de vida'],
  ['deployments', 'Deployments (build & deploy)'],
  ['builds', 'Builds (imagens Docker)'],
  ['events', 'Eventos de domínio'],
  ['webhooks', 'Webhooks assináveis'],
  ['content-types', 'Content Types'],
  ['taxonomies', 'Taxonomias'],
  ['field-groups', 'Field Groups + location rules'],
  ['field-types', 'Field Types do builder'],
  ['health', 'Health checks'],
  ['metrics', 'Métricas Prometheus'],
  ['audit-logs', 'Trilha de auditoria imutável'],
] as const;

function buildOpenApiDocument(origin: string): Record<string, unknown> {
  const paths: Record<string, unknown> = {
    '/api/v1/docs': {
      get: {
        summary: 'Este documento (OpenAPI 3.1)',
        tags: ['meta'],
        responses: { '200': { description: 'Documento OpenAPI' } },
      },
    },
    '/api/v1/hooks/catalog': {
      get: {
        summary: 'Catálogo de hooks gerado a partir do registry',
        tags: ['meta'],
        responses: { '200': { description: 'Lista de hooks conhecidos e registrados' } },
      },
    },
  };

  for (const [resource, description] of RESOURCES) {
    paths[`/api/v1/${resource}`] = {
      get: {
        summary: `Listar ${description}`,
        tags: [resource],
        parameters: [
          { name: 'X-Tenant-ID', in: 'header', schema: { type: 'string' }, description: 'Escopo multi-tenant' },
        ],
        responses: {
          '200': { description: 'Coleção retornada' },
          '401': { description: 'Não autenticado' },
          '429': { description: 'Rate limit excedido (Retry-After)' },
        },
      },
      post: {
        summary: `Criar em ${resource}`,
        tags: [resource],
        security: [{ bearerAuth: [] }],
        responses: {
          '201': { description: 'Criado' },
          '403': { description: 'Sem permissão ou CSRF inválido' },
          '429': { description: 'Rate limit excedido' },
        },
      },
    };
    paths[`/api/v1/${resource}/{id}`] = {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        summary: `Detalhar ${description}`,
        tags: [resource],
        responses: { '200': { description: 'Registro' }, '404': { description: 'Não encontrado' } },
      },
      put: {
        summary: `Substituir registro em ${resource}`,
        tags: [resource],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Atualizado' }, '403': { description: 'Proibido' } },
      },
      delete: {
        summary: `Remover registro em ${resource}`,
        tags: [resource],
        security: [{ bearerAuth: [] }],
        responses: { '204': { description: 'Removido' }, '403': { description: 'Proibido' } },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'OkCMS API',
      version: CMS_VERSION,
      description:
        'CMS híbrido, modular e API-first. Autenticação JWT Bearer; clientes browser também devem enviar o par CSRF (cookie configurado + header X-CSRF-Token). Rate limit padrão: 300 req/min por tenant+IP.',
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        csrfHeader: { type: 'apiKey', in: 'header', name: 'X-CSRF-Token' },
      },
    },
    tags: [
      ...RESOURCES.map(([resource, description]) => ({ name: resource, description })),
      { name: 'meta', description: 'Descoberta (docs, catálogo de hooks)' },
    ],
    paths,
  };
}

router.get('/', (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json(buildOpenApiDocument(origin));
});

export default router;
