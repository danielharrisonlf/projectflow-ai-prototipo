import type { Db } from '../../src/domain/model.js';
import { StateRepository } from '../../src/state/state.repository.js';

/** Repositório em memória para os testes unitários dos services. */
export class InMemoryStateRepository extends StateRepository {
  saved: Db | undefined;
  saves = 0;

  constructor(private initial?: unknown) {
    super();
  }

  async load(): Promise<unknown> {
    return this.initial;
  }

  async save(db: Db): Promise<void> {
    this.saves++;
    this.saved = JSON.parse(JSON.stringify(db)) as Db;
  }

  async archiveInvalid(): Promise<string | undefined> {
    this.initial = undefined;
    return 'memória';
  }

  describe(): string {
    return 'memória';
  }
}
