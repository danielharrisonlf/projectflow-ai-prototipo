/* Permissões e escopo, portados de core.js (PF.can, visibleProjects, canTouchTask…).
   Funções puras: recebem o estado e o usuário que age, sem estado global de "perfil atual". */
import { ROLE_CAPS, type Capability } from './constants.js';
import type { AuditEntry, Db, Project, Task, Team, User } from './model.js';

export function roleCaps(roleId: string): Capability[] {
  return [...(ROLE_CAPS[roleId] ?? [])];
}

export function can(user: User, cap: Capability): boolean {
  return (ROLE_CAPS[user.roleId] ?? []).includes(cap);
}

export function roleName(db: Db, roleId: string): string {
  return db.roles.find((r) => r.id === roleId)?.name ?? roleId;
}

/**
 * Escopo: admin vê todas as organizações; gestor e auditor, a própria organização;
 * líder e dev, só os projetos das próprias equipes (ou que lideram). Arquivados só sob pedido.
 */
export function visibleProjects(db: Db, user: User, opts: { includeArchived?: boolean } = {}): Project[] {
  const list = db.projects.filter((p) => opts.includeArchived || !p.archived);
  if (user.roleId === 'admin') return list;
  if (user.roleId === 'pm' || user.roleId === 'viewer') return list.filter((p) => p.orgId === user.orgId);
  return list.filter((p) => {
    if (p.orgId !== user.orgId) return false;
    if (p.leadId === user.id) return true;
    return p.teamIds.some((t) => user.teamIds.includes(t));
  });
}

export function canSeeProject(db: Db, user: User, projectId: string, opts: { includeArchived?: boolean } = {}): boolean {
  return visibleProjects(db, user, opts).some((p) => p.id === projectId);
}

/** Organização no escopo do usuário (admin enxerga todas). */
export function inMyOrg(user: User, orgId: string): boolean {
  return user.roleId === 'admin' || orgId === user.orgId;
}

export function scopeTeams(db: Db, user: User): Team[] {
  return db.teams.filter((t) => inMyOrg(user, t.orgId));
}

export function scopeUsers(db: Db, user: User): User[] {
  return db.users.filter((u) => inMyOrg(user, u.orgId));
}

/** Quem pode ser responsável por tarefas do projeto: membros ativos das equipes do projeto. */
export function projectMembers(db: Db, projectId: string): User[] {
  const p = db.projects.find((x) => x.id === projectId);
  if (!p) return [];
  const ids = new Set<string>();
  for (const tid of p.teamIds) {
    db.teams.find((t) => t.id === tid)?.memberIds.forEach((m) => ids.add(m));
  }
  return db.users.filter((u) => ids.has(u.id) && !u.invited && u.orgId === p.orgId);
}

/** Registro de auditoria visível: admin vê tudo; os demais, só a própria organização. */
export function canSeeAudit(db: Db, user: User, entry: AuditEntry): boolean {
  if (user.roleId === 'admin') return true;
  const p = entry.projectId ? db.projects.find((x) => x.id === entry.projectId) : undefined;
  if (p) return p.orgId === user.orgId;
  const actor = db.users.find((u) => u.id === entry.userId);
  return !!actor && actor.orgId === user.orgId;
}

/** Escopo antes do papel: gestor e admin também não alteram tarefas fora do que enxergam. */
export function canTouchTask(db: Db, user: User, task: Task): boolean {
  if (!can(user, 'task.edit')) return false;
  if (!canSeeProject(db, user, task.projectId)) return false;
  if (user.roleId === 'admin' || user.roleId === 'pm') return true;
  if (user.roleId === 'lead') return (task.teamId != null && user.teamIds.includes(task.teamId)) || task.assigneeId === user.id;
  return task.assigneeId === user.id || task.createdBy === user.id || !task.assigneeId;
}

/** Sem task.assign só é permitido atribuir a si mesmo (ou tirar a própria atribuição). */
export function assignAllowed(user: User, fromId: string | null, toId: string | null): boolean {
  if (can(user, 'task.assign')) return true;
  return toId ? toId === user.id : !fromId || fromId === user.id;
}
