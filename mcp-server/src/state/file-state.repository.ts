import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import type { Db } from '../domain/model.js';
import { INVALID_JSON, StateRepository } from './state.repository.js';

/** No Windows, rename pode falhar por instantes se outro processo (antivírus, editor) segura o arquivo. */
const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);

async function renameWithRetry(from: string, to: string, attempts = 6): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      if (i >= attempts || !RETRYABLE.has(code)) throw error;
      await new Promise((r) => setTimeout(r, 25 * i));
    }
  }
}

/** Estado em arquivo JSON, com escrita atômica (arquivo temporário + rename). */
@Injectable()
export class FileStateRepository extends StateRepository {
  private readonly file: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super();
    this.file = config.dataFile;
  }

  async load(): Promise<unknown> {
    let text: string;
    try {
      text = await readFile(this.file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    try {
      return JSON.parse(text);
    } catch {
      return INVALID_JSON;
    }
  }

  async save(db: Db): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    try {
      await writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
      await renameWithRetry(tmp, this.file);
    } catch (error) {
      await rm(tmp, { force: true });
      throw error;
    }
  }

  async archiveInvalid(): Promise<string | undefined> {
    const target = `${this.file}.invalid-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    try {
      await renameWithRetry(this.file, target);
      return target;
    } catch {
      return undefined;
    }
  }

  describe(): string {
    return this.file;
  }
}
