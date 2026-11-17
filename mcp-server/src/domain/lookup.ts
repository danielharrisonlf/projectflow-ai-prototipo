/* Resolução de referências vindas do agente (chave PCL, ref PCL-124, nome de pessoa…).
   Fora do escopo do usuário, projeto e tarefa respondem como inexistentes (sem vazar dados),
   como em PF.mcpExecute. */
import { canSeeProject, projectMembers } from './access.js';
import type { Db, Project, Sprint, Task, User } from './model.js';

export function rawProject(db: Db, ref: string): Project | undefined {
  const key = ref.trim().toUpperCase();
  return db.projects.find((p) => p.key === key || p.id === ref.trim());
}

export function rawTask(db: Db, ref: string): Task | undefined {
  const key = ref.trim().toUpperCase();
  return db.tasks.find((t) => t.ref === key || t.id === ref.trim());
}

export function findProject(db: Db, user: User, ref: string, opts: { includeArchived?: boolean } = {}): Project | null {
  const p = rawProject(db, ref);
  return p && canSeeProject(db, user, p.id, opts) ? p : null;
}

export function findTask(db: Db, user: User, ref: string): Task | null {
  const t = rawTask(db, ref);
  return t && canSeeProject(db, user, t.projectId) ? t : null;
}

/** Pessoa por id, e-mail ou nome completo (sem diferenciar maiúsculas). */
export function matchUser(users: User[], who: string): User | undefined {
  const key = who.trim().toLowerCase();
  return users.find((u) => u.id === who.trim() || (u.email ?? '').toLowerCase() === key || (u.name ?? '').toLowerCase() === key);
}

export function findMember(db: Db, projectId: string, who: string): User | undefined {
  return matchUser(projectMembers(db, projectId), who);
}

/** Sprint por id, ou por nome dentro do projeto informado (ou entre as visíveis, se o nome for único). */
export function findSprint(db: Db, user: User, ref: string, projectRef?: string): Sprint | null {
  const byId = db.sprints.find((s) => s.id === ref.trim());
  if (byId) return canSeeProject(db, user, byId.projectId) ? byId : null;
  const name = ref.trim().toLowerCase();
  const project = projectRef ? findProject(db, user, projectRef) : null;
  if (projectRef && !project) return null;
  const candidates = db.sprints.filter(
    (s) => s.name.toLowerCase() === name && (project ? s.projectId === project.id : canSeeProject(db, user, s.projectId)),
  );
  return candidates.length === 1 ? candidates[0]! : null;
}

/** Sprint que corresponde à referência mas está fora do escopo do usuário (para auditar a tentativa). */
export function hiddenSprint(db: Db, user: User, ref: string, projectRef?: string): Sprint | undefined {
  const name = ref.trim().toLowerCase();
  const project = projectRef ? rawProject(db, projectRef) : undefined;
  if (projectRef && !project) return undefined;
  return db.sprints.find(
    (s) =>
      (s.id === ref.trim() || (s.name.toLowerCase() === name && (!project || s.projectId === project.id))) &&
      !canSeeProject(db, user, s.projectId),
  );
}
