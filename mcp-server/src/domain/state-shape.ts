/* Validação, migração e saneamento do estado salvo (PF.load / shapeOk / MIGRATIONS / sanitize
   de core.js). Vale para o arquivo de estado do servidor e para o JSON importado do protótipo. */
import { PRIORITIES, SCHEMA_VERSION, TASK_STATUSES } from './constants.js';
import type { Db, Task } from './model.js';

const ARRAYS = [
  'orgs',
  'roles',
  'users',
  'teams',
  'projects',
  'epics',
  'sprints',
  'milestones',
  'tasks',
  'comments',
  'audit',
  'events',
  'webhooks',
  'deliveries',
  'notifications',
  'notifTemplates',
  'mcpTools',
  'mcpAgents',
  'mcpExecutions',
] as const;
const OBJECTS = ['meta', 'settings', 'notifPrefs', 'providers', 'taskCounters'] as const;

function isObj(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function shapeOk(db: Record<string, unknown>): boolean {
  if (OBJECTS.some((k) => !isObj(db[k]))) return false;
  if (ARRAYS.some((k) => !Array.isArray(db[k]))) return false;
  const users = db.users as unknown[];
  const roles = db.roles as unknown[];
  if (!users.length || !roles.length) return false;
  const str = (o: unknown, k: string) => isObj(o) && typeof o[k] === 'string';
  return (
    (db.tasks as unknown[]).every((t) => str(t, 'id') && str(t, 'ref') && str(t, 'projectId')) &&
    users.every((u) => str(u, 'id') && str(u, 'name')) &&
    (db.projects as unknown[]).every((p) => str(p, 'id') && str(p, 'key') && str(p, 'name'))
  );
}

/** Migrações incrementais (schema 1 = estado salvo antes do schema 2 do protótipo). */
const MIGRATIONS: Record<number, (db: Db) => void> = {
  2: (db) => {
    // data de conclusão real (antes inferida de updatedAt) e favoritos por pessoa
    for (const t of db.tasks as Array<Partial<Task> & Pick<Task, 'status' | 'updatedAt'>>) {
      if (!('doneAt' in t)) t.doneAt = t.status === 'done' ? t.updatedAt || null : null;
    }
    const favIds = db.projects.filter((p) => p.favorite).map((p) => p.id);
    for (const u of db.users) if (!Array.isArray(u.favoriteProjectIds)) u.favoriteProjectIds = [...favIds];
  },
};

/** Conserta valores fora do domínio que quebrariam as regras. */
function sanitize(db: Db): void {
  for (const t of db.tasks) {
    if (!TASK_STATUSES.includes(t.status)) t.status = 'todo';
    if (!PRIORITIES.includes(t.priority)) t.priority = 'medium';
    if (!['task', 'bug', 'subtask'].includes(t.type)) t.type = t.parentId ? 'subtask' : 'task';
    if (typeof t.title !== 'string' || !t.title.trim()) t.title = String(t.title || '') || '(sem título)';
    if (!Array.isArray(t.labels)) t.labels = [];
    if (!Array.isArray(t.acceptance)) t.acceptance = [];
    if (!Array.isArray(t.blockedBy)) t.blockedBy = [];
    if (t.dueDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(t.dueDate)) t.dueDate = null;
  }
  for (const u of db.users) if (!Array.isArray(u.teamIds)) u.teamIds = [];
  for (const t of db.teams) if (!Array.isArray(t.memberIds)) t.memberIds = [];
  for (const p of db.projects) if (!Array.isArray(p.teamIds)) p.teamIds = [];
  if (!db.users.some((u) => u.id === db.settings.currentUserId)) {
    db.settings.currentUserId = (db.users.find((u) => u.roleId === 'admin') ?? db.users[0])!.id;
  }
}

export type NormalizeResult = { ok: true; db: Db } | { ok: false; reason: string };

/**
 * Valida o formato, migra para o schema atual e saneia. `seedVersion` é a versão do seed do
 * protótipo: estados de outra versão são recusados, como o protótipo faz ao carregar.
 */
export function normalizeState(raw: unknown, seedVersion: number | null): NormalizeResult {
  if (!isObj(raw) || !isObj(raw.meta)) return { ok: false, reason: 'O JSON não tem o formato do estado do ProjectFlow (falta "meta").' };
  if (seedVersion != null && raw.meta.seedVersion !== seedVersion) {
    return {
      ok: false,
      reason: `O estado é de outra versão da demonstração (seedVersion ${String(raw.meta.seedVersion)}; esperado ${seedVersion}).`,
    };
  }
  if (!shapeOk(raw)) return { ok: false, reason: 'O estado está incompleto: faltam coleções obrigatórias ou há registros sem id.' };
  const db = structuredClone(raw) as unknown as Db;
  for (let v = (db.meta.schema ?? 1) + 1; v <= SCHEMA_VERSION; v++) MIGRATIONS[v]?.(db);
  db.meta.schema = SCHEMA_VERSION;
  sanitize(db);
  return { ok: true, db };
}
