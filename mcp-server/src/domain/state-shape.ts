/* Validação, migração e saneamento do estado salvo (PF.load / shapeOk / MIGRATIONS / sanitize
   de core.js). Vale para o arquivo de estado do servidor e para o JSON importado do protótipo. */
import { PRIORITIES, PROJECT_STATUSES, SCHEMA_VERSION, TASK_STATUSES } from './constants.js';
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

const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/**
 * Completa campos opcionais ausentes num estado importado (o JSON pode ter sido editado à mão):
 * as visões devolvidas ao agente contam com eles.
 */
function fillDefaults(db: Db): void {
  const fallbackTs = str(db.meta.seededAt, new Date().toISOString());
  for (const u of db.users) {
    u.email = str(u.email, '');
    u.roleId = str(u.roleId, 'viewer');
    u.orgId = str(u.orgId, '');
  }
  for (const t of db.teams) {
    t.name = str(t.name, t.id);
    t.leadId = strOrNull(t.leadId);
  }
  for (const p of db.projects) {
    p.desc = str(p.desc, '');
    p.orgId = str(p.orgId, '');
    if (!PROJECT_STATUSES.includes(p.status)) p.status = 'active';
    if (!PRIORITIES.includes(p.priority)) p.priority = 'medium';
    p.archived = p.archived === true;
    p.leadId = strOrNull(p.leadId);
    p.startDate = strOrNull(p.startDate);
    p.targetDate = strOrNull(p.targetDate);
    p.createdAt = str(p.createdAt, fallbackTs);
  }
  for (const e of db.epics) {
    e.name = str(e.name, '(sem nome)');
    e.status = str(e.status, 'active');
  }
  for (const m of db.milestones) {
    m.name = str(m.name, '(sem nome)');
    m.date = str(m.date, '');
    m.status = str(m.status, 'open');
  }
  for (const s of db.sprints) {
    s.name = str(s.name, s.id);
    s.goal = str(s.goal, '');
    if (!['planned', 'active', 'done'].includes(s.status)) s.status = 'planned';
    s.startDate = str(s.startDate, '');
    s.endDate = str(s.endDate, '');
  }
  for (const t of db.tasks) {
    t.desc = str(t.desc, '');
    t.createdAt = str(t.createdAt, fallbackTs);
    t.updatedAt = str(t.updatedAt, t.createdAt);
    for (const k of ['epicId', 'parentId', 'assigneeId', 'teamId', 'sprintId', 'createdBy', 'doneAt'] as const) t[k] = strOrNull(t[k]);
  }
  for (const c of db.comments) {
    c.text = str(c.text, '');
    c.createdAt = str(c.createdAt, fallbackTs);
  }
  for (const a of db.audit) {
    a.ts = str(a.ts, fallbackTs);
    a.action = str(a.action, 'update');
    a.summary = str(a.summary, '');
    a.source = str(a.source, 'ui');
    a.entityType = str(a.entityType, 'unknown');
  }
}

/** Conserta valores fora do domínio que quebrariam as regras. */
function sanitize(db: Db): void {
  fillDefaults(db);
  for (const t of db.tasks) {
    if (!TASK_STATUSES.includes(t.status)) t.status = 'todo';
    if (!PRIORITIES.includes(t.priority)) t.priority = 'medium';
    if (!['task', 'bug', 'subtask'].includes(t.type)) t.type = t.parentId ? 'subtask' : 'task';
    if (typeof t.title !== 'string' || !t.title.trim()) t.title = String(t.title || '') || '(sem título)';
    if (!Array.isArray(t.labels)) t.labels = [];
    t.acceptance = Array.isArray(t.acceptance)
      ? t.acceptance.filter((a) => a && typeof a.text === 'string').map((a) => ({ text: a.text, done: a.done === true }))
      : [];
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

/** Profundidade máxima de aninhamento aceita: o estado real tem menos de 10 níveis. */
const MAX_DEPTH = 64;

/** Mede a profundidade sem recursão (um JSON hostil com milhares de níveis não estoura a pilha). */
function tooDeep(value: unknown): boolean {
  const stack: [unknown, number][] = [[value, 1]];
  while (stack.length) {
    const [v, depth] = stack.pop()!;
    if (v == null || typeof v !== 'object') continue;
    if (depth > MAX_DEPTH) return true;
    for (const child of Object.values(v)) stack.push([child, depth + 1]);
  }
  return false;
}

export type NormalizeResult = { ok: true; db: Db } | { ok: false; reason: string };

/**
 * Valida o formato, migra para o schema atual e saneia. `seedVersion` é a versão do seed do
 * protótipo: estados de outra versão são recusados, como o protótipo faz ao carregar.
 */
export function normalizeState(raw: unknown, seedVersion: number | null): NormalizeResult {
  if (tooDeep(raw)) return { ok: false, reason: `o JSON tem aninhamento acima de ${MAX_DEPTH} níveis.` };
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
