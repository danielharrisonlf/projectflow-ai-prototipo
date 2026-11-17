/* Derivações de domínio (progresso, risco, atraso, bloqueio e prazo), portadas de core.js
   e views-insights.js. */
import { daysLeft, ymd } from './dates.js';
import type { Db, Project, Task } from './model.js';

export function projectTasks(db: Db, projectId: string): Task[] {
  return db.tasks.filter((t) => t.projectId === projectId);
}

/** % de tarefas (sem subtarefas) concluídas. */
export function projectProgress(db: Db, projectId: string): number {
  const ts = projectTasks(db, projectId).filter((t) => !t.parentId);
  if (!ts.length) return 0;
  return Math.round((100 * ts.filter((t) => t.status === 'done').length) / ts.length);
}

export function isOverdue(t: Task, now: Date = new Date()): boolean {
  if (!t.dueDate || t.status === 'done') return false;
  const left = daysLeft(t.dueDate, now);
  return left != null && left < 0;
}

/** Bloqueio só conta enquanto a tarefa bloqueadora existe e não foi concluída. */
export function activeBlockers(db: Db, t: Task): Task[] {
  return (t.blockedBy ?? [])
    .map((id) => db.tasks.find((x) => x.id === id))
    .filter((b): b is Task => !!b && b.status !== 'done');
}

export function isBlocked(db: Db, t: Task): boolean {
  return t.status !== 'done' && activeBlockers(db, t).length > 0;
}

export type RiskLevel = 'ok' | 'mid' | 'high';

export interface ProjectRisk {
  level: RiskLevel;
  label: string;
  late: number;
  blocked: number;
}

export function projectRisk(db: Db, p: Project, now: Date = new Date()): ProjectRisk {
  const ts = projectTasks(db, p.id).filter((t) => !t.parentId);
  const late = ts.filter((t) => isOverdue(t, now)).length;
  const blocked = ts.filter((t) => isBlocked(db, t)).length;
  const target = p.targetDate ? daysLeft(p.targetDate, now) : 99;
  const prog = projectProgress(db, p.id);
  if (p.status === 'done') return { level: 'ok', label: 'Entregue', late, blocked };
  if (late >= 3 || (target != null && target < 15 && prog < 60) || blocked >= 2) return { level: 'high', label: 'Em risco', late, blocked };
  if (late >= 1 || (target != null && target < 30 && prog < 50)) return { level: 'mid', label: 'Atenção', late, blocked };
  return { level: 'ok', label: 'Saudável', late, blocked };
}

/** Dia (calendário local) em que a tarefa foi concluída. */
export function doneDay(t: Task): string | null {
  return t.status === 'done' && t.doneAt ? ymd(new Date(t.doneAt)) : null;
}

/** % de tarefas concluídas com prazo que terminaram até o prazo; null sem amostra. */
export function onTimeRate(tasks: Task[]): number | null {
  const withDue = tasks.filter((t) => t.status === 'done' && t.dueDate);
  if (!withDue.length) return null;
  const ok = withDue.filter((t) => {
    const d = doneDay(t);
    return d != null && d <= (t.dueDate as string);
  }).length;
  return Math.round((100 * ok) / withDue.length);
}
