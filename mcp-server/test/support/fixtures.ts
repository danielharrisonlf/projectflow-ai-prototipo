import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Actor } from '../../src/domain/actor.js';
import type { Db } from '../../src/domain/model.js';

/** Tokens de config/tokens.demo.json. */
export const TOKENS = {
  admin: 'pf-demo-admin-7c2e9a41d3',
  gestor: 'pf-demo-gestor-5b81f0c6aa',
  gestorLeitura: 'pf-demo-gestor-leitura-e4d2c9',
  lider: 'pf-demo-lider-93ad17be42',
  dev: 'pf-demo-dev-2f6c84d1e9',
  auditor: 'pf-demo-auditor-c07b5e3f18',
} as const;

/** Diretório temporário isolado por teste, com o caminho do arquivo de estado. */
export function tempState(): { dir: string; file: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'pf-mcp-'));
  return { dir, file: join(dir, 'state.json'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function actorOf(db: Readonly<Db>, userId: string): Actor {
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error(`usuário ${userId} não existe no seed`);
  return { user, source: 'mcp' };
}

/** Texto do primeiro bloco de um resultado de ferramenta. */
export function text(result: { content?: unknown }): string {
  const [first] = (result.content ?? []) as { type: string; text?: string }[];
  return first?.type === 'text' ? (first.text ?? '') : '';
}

export function json<T = any>(result: { content?: unknown; structuredContent?: unknown }): T {
  return (result.structuredContent ?? JSON.parse(text(result))) as T;
}
