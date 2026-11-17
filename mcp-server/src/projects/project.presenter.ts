/* Visões de projeto devolvidas ao agente (sem campos internos como cor ou idade do seed). */
import { STATUS_LABELS, TASK_STATUSES } from '../domain/constants.js';
import { projectProgress, projectRisk, projectTasks } from '../domain/metrics.js';
import type { Db, Project } from '../domain/model.js';

export function projectSummary(db: Readonly<Db>, p: Project) {
  return {
    key: p.key,
    name: p.name,
    status: p.status,
    priority: p.priority,
    progress: projectProgress(db as Db, p.id),
    targetDate: p.targetDate ?? null,
    archived: !!p.archived,
    org: db.orgs.find((o) => o.id === p.orgId)?.name ?? p.orgId,
    lead: p.leadId ? (db.users.find((u) => u.id === p.leadId)?.name ?? null) : null,
    teams: p.teamIds.map((id) => db.teams.find((t) => t.id === id)?.name ?? id),
  };
}

export function projectDetail(db: Readonly<Db>, p: Project) {
  const tasks = projectTasks(db as Db, p.id).filter((t) => !t.parentId);
  const risk = projectRisk(db as Db, p);
  return {
    ...projectSummary(db, p),
    id: p.id,
    description: p.desc ?? '',
    startDate: p.startDate ?? null,
    createdAt: p.createdAt ?? null,
    risk: { level: risk.level, label: risk.label, overdueTasks: risk.late, blockedTasks: risk.blocked },
    taskCounts: Object.fromEntries(TASK_STATUSES.map((s) => [s, tasks.filter((t) => t.status === s).length])) as Record<string, number>,
    epics: db.epics.filter((e) => e.projectId === p.id).map((e) => ({ name: e.name, status: e.status })),
    milestones: db.milestones.filter((m) => m.projectId === p.id).map((m) => ({ name: m.name, date: m.date, status: m.status })),
    sprints: db.sprints.filter((s) => s.projectId === p.id).map((s) => ({ id: s.id, name: s.name, status: s.status, startDate: s.startDate, endDate: s.endDate })),
  };
}

export const STATUS_LABEL_LIST = TASK_STATUSES.map((s) => `${s} (${STATUS_LABELS[s]})`).join(', ');
