// @oktis-works/auth - Códigos de erro estáveis para autenticação

/** Códigos de erro estáveis que o cliente pode inspecionar sem depender do texto da mensagem. */
export enum AuthErrorCode {
  /** Credenciais inválidas (e-mail não encontrado ou senha incorreta). */
  INVALID_CREDENTIALS = 'invalid_credentials',
  /** Usuário não encontrado no banco. */
  USER_NOT_FOUND = 'user_not_found',
  /** Senha informada não corresponde ao hash armazenado. */
  PASSWORD_INVALID = 'password_invalid',
  /** Hash de senha armazenado é inválido ou legado. */
  HASH_INVALID = 'hash_invalid',
  /** Falha ao criar sessão no banco. */
  SESSION_CREATE_FAILED = 'session_create_failed',
  /** Erro de banco de dados (conexão, schema, tenant). */
  DB_ERROR = 'db_error',
  /** Tenant não encontrado para o host informado. */
  TENANT_NOT_FOUND = 'tenant_not_found',
  /** Sessão ativa não encontrada para refresh. */
  NO_ACTIVE_SESSION = 'no_active_session',
  /** Erro interno não especificado. */
  INTERNAL_ERROR = 'internal_error',
}

/** Erro tipado de autenticação com código estável e status HTTP. */
export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly statusCode: number;

  constructor(code: AuthErrorCode, message: string, statusCode: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/** Erro de credenciais inválidas (401). */
export class InvalidCredentialsError extends AuthError {
  constructor(message = 'Invalid credentials') {
    super(AuthErrorCode.INVALID_CREDENTIALS, message, 401);
  }
}

/** Erro de sessão não encontrada para refresh (401). */
export class NoActiveSessionError extends AuthError {
  constructor(message = 'No active session') {
    super(AuthErrorCode.NO_ACTIVE_SESSION, message, 401);
  }
}

/** Erro interno de banco/sessão/schema (500). */
export class InternalAuthError extends AuthError {
  constructor(message: string, code: AuthErrorCode = AuthErrorCode.INTERNAL_ERROR) {
    super(code, message, 500);
  }
}
