import { Inject, Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { DomainError } from '../domain/errors.js';
import type { Db, McpExecution } from '../domain/model.js';
import { normalizeState } from '../domain/state-shape.js';
import { SeedProvider, type SeedSource } from './seed.provider.js';
import { isInvalidJson, StateRepository } from './state.repository.js';

/** Espera para agrupar gravações que não são de negócio (histórico de execuções), como o PF.save. */
const FLUSH_DELAY_MS = 200;

/** Coleções que só crescem: aparadas em `historyLimit` (mais recentes primeiro). */
const HISTORY = ['audit', 'events', 'deliveries', 'notifications', 'mcpExecutions'] as const;

/**
 * Dono do estado em memória. Toda mutação passa por `transaction()`, uma de cada vez (fila):
 * roda sobre uma cópia, GRAVA a cópia e só então a publica. Se a validação ou a gravação falham,
 * o estado em memória e o arquivo ficam como estavam — mutação, auditoria, eventos e entregas
 * são atômicos, como a auditoria "na mesma transação" prevista para o ms-projects, e um agente
 * que repete a chamada depois de um erro não duplica nada.
 * Exceção: a negação de permissão — o registro `denied` que acompanha o erro é gravado mesmo assim.
 */
@Injectable()
export class StateStore implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('StateStore');
  private db!: Db;
  private queue: Promise<unknown> = Promise.resolve();
  private origin: SeedSource | 'file' = 'file';
  /** Há mudanças em memória ainda não gravadas (só histórico de execuções). */
  private dirty = false;
  private flushTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly repository: StateRepository,
    private readonly seeds: SeedProvider,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'historyLimit'>,
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

  /** Grava o que estiver pendente ao encerrar (HTTP com enableShutdownHooks, stdio no app.close()). */
  async onApplicationShutdown(): Promise<void> {
    await this.flush();
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

  /** Leitura do estado publicado (já gravado). `fn` não deve alterar o que recebe. */
  read<T>(fn: (db: Readonly<Db>) => T): T {
    return fn(this.db);
  }

  transaction<T>(fn: (db: Db) => T): Promise<T> {
    return this.exclusive(async () => {
      const draft = structuredClone(this.db);
      let result: T;
      try {
        result = fn(draft);
      } catch (error) {
        if (error instanceof DomainError && error.auditEntry) {
          const withDenial = structuredClone(this.db);
          withDenial.audit.unshift(error.auditEntry);
          await this.commit(withDenial);
        }
        throw error;
      }
      await this.commit(draft);
      return result;
    });
  }

  /** Substitui todo o estado (importação); só publica se a gravação der certo. */
  replace(db: Db): Promise<void> {
    return this.exclusive(async () => {
      await this.commit(db);
      this.origin = 'file';
    });
  }

  /** Volta ao cenário inicial (seed). */
  reseed(): Promise<SeedSource> {
    return this.exclusive(async () => {
      const seed = this.seeds.build();
      await this.commit(seed.db);
      this.origin = seed.source;
      this.logger.log(`Estado inicial criado a partir do seed (${seed.source}) em ${this.repository.describe()}`);
      return seed.source;
    });
  }

  /**
   * Histórico de execuções MCP (aba "Execuções" do protótipo): não é dado de negócio, então não
   * custa uma transação nem uma gravação por chamada — entra na memória e vai ao disco agrupado.
   */
  recordExecution(entry: McpExecution): Promise<void> {
    return this.exclusive(async () => {
      this.db.mcpExecutions.unshift(entry);
      this.trim(this.db);
      this.dirty = true;
      this.scheduleFlush();
    });
  }

  /** Grava agora o que estiver pendente. */
  flush(): Promise<void> {
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    return this.exclusive(async () => {
      if (!this.dirty) return;
      try {
        await this.repository.save(this.db);
        this.dirty = false;
      } catch (error) {
        this.logger.error(`Falha ao gravar o histórico de execuções: ${(error as Error).message}`);
      }
    });
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.flush();
    }, FLUSH_DELAY_MS);
    this.flushTimer.unref();
  }

  /** Grava `next` e só então o publica. Falha na gravação: nada muda em memória. */
  private async commit(next: Db): Promise<void> {
    this.trim(next);
    try {
      await this.repository.save(next);
    } catch (error) {
      this.logger.error(`Falha ao gravar o estado; a operação foi desfeita: ${(error as Error).message}`);
      throw error;
    }
    this.db = next;
    this.dirty = false;
  }

  private trim(db: Db): void {
    const limit = this.config.historyLimit;
    for (const key of HISTORY) {
      const list = db[key] as unknown[];
      if (list.length > limit) list.length = limit;
    }
  }

  /** Uma operação de cada vez: nenhuma transação vê (ou sobrescreve) uma cópia velha. */
  private exclusive<T>(op: () => Promise<T>): Promise<T> {
    const run = this.queue.then(op, op);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
