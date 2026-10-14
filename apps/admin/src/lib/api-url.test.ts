// @oktis-works/admin - lib/api-url: join sem prefixo /api duplicado

import { describe, it, expect } from 'vitest';
import { joinApiUrl } from './api-url.js';

describe('joinApiUrl', () => {
  it('base /api + rota /api/v1 → sem duplicação (bug do login em okcms dev)', () => {
    expect(joinApiUrl('/api', '/api/v1/auth/csrf')).toBe('/api/v1/auth/csrf');
    expect(joinApiUrl('/api', '/api/v1/auth/login')).toBe('/api/v1/auth/login');
    expect(joinApiUrl('/api', '/api/v1/media/upload')).toBe('/api/v1/media/upload');
  });

  it('tolera barra final na base', () => {
    expect(joinApiUrl('/api/', '/api/v1/auth/csrf')).toBe('/api/v1/auth/csrf');
  });

  it('base absoluta terminada em /api remove o prefixo repetido', () => {
    expect(joinApiUrl('http://localhost:3000/api', '/api/v1/x')).toBe('http://localhost:3000/api/v1/x');
  });

  it('origin puro (modo lvh.me/direto) fica inalterado', () => {
    expect(joinApiUrl('http://localhost:3000', '/api/v1/x')).toBe('http://localhost:3000/api/v1/x');
    expect(joinApiUrl('http://api.lvh.me:3000', '/api/v1/auth/csrf')).toBe('http://api.lvh.me:3000/api/v1/auth/csrf');
  });

  it('base vazia (produção com proxy nginx) fica inalterada', () => {
    expect(joinApiUrl('', '/api/v1/x')).toBe('/api/v1/x');
  });

  it('path sem prefixo /api não é alterado', () => {
    expect(joinApiUrl('/api', '/health')).toBe('/api/health');
    expect(joinApiUrl('http://localhost:3000', '/health')).toBe('http://localhost:3000/health');
  });

  it('base parecida com /api mas não idêntica não casa (ex.: /api-gateway)', () => {
    expect(joinApiUrl('/api-gateway', '/api/v1/x')).toBe('/api-gateway/api/v1/x');
  });
});
