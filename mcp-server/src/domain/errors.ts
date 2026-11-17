/* Erros de domínio: independentes de transporte. O filtro MCP os traduz em resultado de
   ferramenta com isError (ou em erro de protocolo, para recursos e prompts). */
import type { AuditEntry } from './model.js';

export type DomainErrorCode = 'not_found' | 'invalid_args' | 'permission_denied' | 'conflict' | 'unauthenticated';

export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;

  /**
   * Registro `denied` que acompanha o erro: o StateStore grava esse registro mesmo
   * descartando o resto da transação (a tentativa fica no histórico).
   */
  constructor(
    message: string,
    readonly auditEntry?: AuditEntry,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'not_found' as const;
}

export class ValidationError extends DomainError {
  readonly code = 'invalid_args' as const;
}

export class ConflictError extends DomainError {
  readonly code = 'conflict' as const;
}

export class UnauthenticatedError extends DomainError {
  readonly code = 'unauthenticated' as const;
}

export class PermissionDeniedError extends DomainError {
  readonly code = 'permission_denied' as const;
}
