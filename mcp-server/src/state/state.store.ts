import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DomainError } from '../domain/errors.js';
import type { Db } from '../domain/model.js';
import { normalizeState } from '../domain/state-shape.js';
import { SeedProvider, type SeedSource } from './seed.provider.js';
import { isInvalidJson, StateRepository } from './state.repository.js';

/**
 * Dono do estado em memória. Toda mutação passa por `transaction()`: roda sobre uma cópia,
 * que só substitui o estado (e é persistida) se nada falhar — mutação, auditoria e eventos
 * são atômicos, como a auditoria "na mesma transação" prevista para o ms-projects.
 * Uma negação de permissão é a exceção: o registro `denied` que acompanha o erro é gravado mesmo assim.
 */
@Injectable()
export class StateStore implements OnModuleInit {
  private readonly logger = new Logger('StateStore');
  private db!: Db;
  private writes: Promise<void> = Promise.resolve();
  private origin: SeedSource | 'file' = 'file';

  constructor(
    private readonly repository: StateRepository,
    private readonly seeds: SeedProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    const saved = await this.repository.load();
    if (saved !== undefined) {
      const result = isInvalidJson(saved)
        ? ({ ok: false, reason: 'o arquivo não é um JSON válido' } as const)
        : normalizeState(saved, this.seeds.version());
      if (result.ok) {
        this.db = result.db;
        this.origin = 'file';
        this.logger.log(`Estado carregado de ${this.repository.describe()}`);
        return;
      }
      const archived = await this.repository.archiveInvalid();
      this.logger.warn(`Estado salvo descartado (${result.reason})${archived ? `; cópia em ${archived}` : ''}.`);
    }
    await this.reseed();
  }

  /** De onde veio o estado atual: arquivo existente, seed do protótipo, JSON de seed ou mínimo. */
  get source(): SeedSource | 'file' {
    return this.origin;
  }

  get location(): string {
    return this.repository.describe();
  }

  get seedVersion(): number | null {
    return this.seeds.version();
  }

  /** Leitura do estado atual. `fn` não deve alterar o que recebe. */
  read<T>(fn: (db: Readonly<Db>) => T): T {
    return fn(this.db);
  }

  async transaction<T>(fn: (db: Db) => T): Promise<T> {
    const draft = structuredClone(this.db);
    let result: T;
    try {
      result = fn(draft);
    } catch (error) {
      if (error instanceof DomainError && error.auditEntry) {
        this.db.audit.unshift(error.auditEntry);
        await this.persist();
      }
      throw error;
    }
    this.db = draft;
    await this.persist();
    return result;
  }

  /** Substitui todo o estado (importação). */
  async replace(db: Db): Promise<void> {
    this.db = db;
    this.origin = 'file';
    await this.persist();
  }

  /** Volta ao cenário inicial (seed). */
  async reseed(): Promise<SeedSource> {
    const seed = this.seeds.build();
    this.db = seed.db;
    this.origin = seed.source;
    await this.persist();
    this.logger.log(`Estado inicial criado a partir do seed (${seed.source}) em ${this.repository.describe()}`);
    return seed.source;
  }

  /** Grava em fila: as escritas saem na ordem das transações, sempre com o estado mais recente. */
  private persist(): Promise<void> {
    const write = this.writes.then(() => this.repository.save(this.db));
    this.writes = write.catch((error: unknown) => {
      this.logger.error(`Falha ao gravar o estado: ${(error as Error).message}`);
    });
    return write;
  }
}
