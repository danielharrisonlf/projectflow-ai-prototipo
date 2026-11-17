import type { Db } from '../domain/model.js';

/** O que `load()` devolve quando o conteúdo salvo nem chega a ser JSON. */
export const INVALID_JSON = Object.freeze({ __invalidJson: true });

export function isInvalidJson(value: unknown): boolean {
  return value === INVALID_JSON;
}

/**
 * Porta de persistência do estado. A implementação padrão grava em arquivo JSON; os testes
 * usam uma em memória. Trocar por banco (o `projectflow.db.v1` vira tabelas) não muda os services.
 */
export abstract class StateRepository {
  /** O estado salvo, ainda não validado; `undefined` quando não há nada salvo. */
  abstract load(): Promise<unknown>;

  abstract save(db: Db): Promise<void>;

  /** Tira de circulação um estado salvo que não pôde ser aproveitado; devolve onde ficou a cópia. */
  abstract archiveInvalid(): Promise<string | undefined>;

  /** Onde o estado vive, para logs e para o recurso pf://me. */
  abstract describe(): string;
}
