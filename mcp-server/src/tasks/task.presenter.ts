/* Visões de tarefa devolvidas ao agente (o `tjson` de PF.mcpExecute, ampliado). */
import { canSeeAudit } from '../domain/access.js';
import { isBlocked, isOverdue } from '../domain/metrics.js';
import type { Db, Task, User } from '../domain/model.js';

const nameOf = (db: Readonly<Db>, id: string | null) => (id ? (db.users.find((u) => u.id === id)?.name ?? null) : null);

export function taskSummary(db: Readonly<Db>, t: Task) {
  return {
    ref: t.ref,
    title: t.title,
    type: t.type,
    status: t.status,
    priority: t.priority,
    assignee: nameOf(db, t.assigneeId),
    project: db.projects.find((p) => p.id === t.projectId)?.key ?? t.projectId,
    sprint: t.sprintId ? (db.sprints.find((s) => s.id === t.sprintId)?.name ?? null) : null,
    dueDate: t.dueDate ?? null,
    overdue: isOverdue(t),
    blocked: isBlocked(db as Db, t),
  };
}

export function taskDetail(db: Readonly<Db>, t: Task, viewer: User) {
  const ref = (id: string) => {
    const x = db.tasks.find((k) => k.id === id);
    return x ? { ref: x.ref, title: x.title, status: x.status } : null;
  };
  return {
    ...taskSummary(db, t),
    id: t.id,
    description: t.desc ?? '',
    labels: t.labels,
    acceptance: t.acceptance,
    epic: t.epicId ? (db.epics.find((e) => e.id === t.epicId)?.name ?? null) : null,
    parent: t.parentId ? ref(t.parentId) : null,
    team: t.teamId ? (db.teams.find((x) => x.id === t.teamId)?.name ?? null) : null,
    subtasks: db.tasks.filter((x) => x.parentId === t.id).map((x) => ({ ref: x.ref, title: x.title, status: x.status })),
    blockedBy: t.blockedBy.map(ref).filter((x) => x !== null),
    blocking: db.tasks.filter((x) => x.blockedBy.includes(t.id)).map((x) => ({ ref: x.ref, title: x.title, status: x.status })),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    doneAt: t.doneAt ?? null,
    createdBy: nameOf(db, t.createdBy),
    comments: db.comments
      .filter((c) => c.taskId === t.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => ({ author: nameOf(db, c.userId) ?? c.userId, text: c.text, createdAt: c.createdAt })),
    history: db.audit
      .filter((a) => a.entityId === t.id && canSeeAudit(db as Db, viewer, a))
      .slice(0, 20)
      .map((a) => ({ ts: a.ts, user: nameOf(db, a.userId) ?? a.userId, action: a.action, summary: a.summary, source: a.source })),
  };
}
