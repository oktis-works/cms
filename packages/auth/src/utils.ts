// @oktis-works/auth - Utilitários compartilhados

/** Normaliza um endereço de e-mail: trim + lowercase. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
