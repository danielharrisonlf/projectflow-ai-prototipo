import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { assignAllowed, can, canSeeProject, canTouchTask, scopeUsers, visibleProjects } from '../domain/access.js';
import type { Actor } from '../domain/actor.js';
import { STATUS_LABELS } from '../domain/constants.js';
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors.js';
import { uid } from '../domain/ids.js';
import { findMember, findProject, findSprint, matchUser, rawProject, rawTask } from '../domain/lookup.js';
import { isBlocked, isOverdue } from '../domain/metrics.js';
import type { Db, Priority, Task, TaskStatus, TaskType } from '../domain/model.js';
import { sameValue, strOk, validateTask, type TaskFields } from '../domain/validation.js';
import { EventsService } from '../events/events.service.js';
import { StateStore } from '../state/state.store.js';
import { taskDetail, taskSummary } from './task.presenter.js';

export interface ListTasksParams {
  project?: string;
  status?: TaskStatus;
  assignee?: string;
  sprint?: string;
  type?: TaskType;
  priority?: Priority;
  label?: string;
  overdue?: boolean;
  blocked?: boolean;
  search?: string;
  includeSubtasks?: boolean;
  limit?: number;
}

export interface CreateTaskParams {
  project: string;
  title: string;
  type?: TaskType;
  priority?: Priority;
  assignee?: string;
  description?: string;
  dueDate?: string;
  epic?: string;
  sprint?: string;
  labels?: string[];
  parent?: string;
}

export interface UpdateTaskFields {
  title?: string;
  description?: string;
  priority?: Priority;
  dueDate?: string | null;
  labels?: string[];
  acceptance?: { text: string; done: boolean }[];
  epic?: string | null;
}

/** Tarefas: consulta com escopo e mutações com as regras de act.createTask/updateTask de core.js. */
@Injectable()
export class TasksService {
  constructor(
    private readonly store: StateStore,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  list(actor: Actor, params: ListTasksParams = {}) {
    return this.store.read((db) => {
      const project = params.project ? findProject(db as Db, actor.user, params.project) : null;
      if (params.project && !project) throw new NotFoundError(`Projeto "${params.project}" não encontrado ou fora do seu escopo de acesso.`);
      const visible = new Set(visibleProjects(db as Db, actor.user).map((p) => p.id));
      const assigneeId = this.assigneeFilter(db as Db, actor, params.assignee);
      const sprintIds = params.sprint ? this.sprintFilter(db as Db, actor, params.sprint, project?.id) : null;
      const search = params.search?.trim().toLowerCase();
      const all = db.tasks.filter(
        (t) =>
          visible.has(t.projectId) &&
          (params.includeSubtasks || !t.parentId) &&
          (!project || t.projectId === project.id) &&
          (!params.status || t.status === params.status) &&
          (!params.type || t.type === params.type) &&
          (!params.priority || t.priority === params.priority) &&
          (!params.label || t.labels.includes(params.label)) &&
          (assigneeId === undefined || t.assigneeId === assigneeId) &&
          (!sprintIds || (t.sprintId != null && sprintIds.has(t.sprintId))) &&
          (params.overdue === undefined || isOverdue(t) === params.overdue) &&
          (params.blocked === undefined || isBlocked(db as Db, t) === params.blocked) &&
          (!search || t.title.toLowerCase().includes(search) || t.ref.toLowerCase() === search),
      );
      const limit = Math.min(params.limit ?? 25, 100);
      return { total: all.length, count: Math.min(all.length, limit), tasks: all.slice(0, limit).map((t) => taskSummary(db, t)) };
    });
  }

  get(actor: Actor, ref: string) {
    return this.store.read((db) => {
      const t = rawTask(db as Db, ref);
      if (!t || !canSeeProject(db as Db, actor.user, t.projectId)) throw new NotFoundError(this.notFound(ref));
      return taskDetail(db, t, actor.user);
    });
  }

  async create(actor: Actor, params: CreateTaskParams) {
    if (!can(actor.user, 'task.create')) throw await this.audit.deny(actor, 'criar tarefas');
    return this.store.transaction((db) => {
      const p = rawProject(db, params.project);
      const missing = `Projeto "${params.project}" não encontrado ou fora do seu escopo de acesso.`;
      if (!p) throw new NotFoundError(missing);
      if (!canSeeProject(db, actor.user, p.id)) throw this.audit.outOfScope(actor, `criar tarefas no projeto ${p.key}`, missing);
      const type = params.type ?? 'task';
      let parentId: string | null = null;
      if (params.parent) {
        const parent = rawTask(db, params.parent);
        if (!parent || parent.projectId !== p.id) throw new ValidationError('A tarefa-mãe precisa ser do mesmo projeto.');
        parentId = parent.id;
      }
      if (type === 'subtask' && !parentId) throw new ValidationError('Subtarefas precisam de uma tarefa-mãe (parent).');
      let assigneeId: string | null = null;
      if (params.assignee) {
        const member = findMember(db, p.id, params.assignee);
        if (!member) throw new ValidationError('O responsável precisa ser membro ativo das equipes do projeto (use nome completo, e-mail ou id).');
        if (!assignAllowed(actor.user, null, member.id)) throw this.audit.denial(db, actor, 'atribuir tarefas a outras pessoas');
        assigneeId = member.id;
      }
      const fields: TaskFields = {
        title: params.title,
        type,
        priority: params.priority ?? 'medium',
        desc: params.description ?? '',
        dueDate: params.dueDate ?? null,
        labels: params.labels ?? [],
        assigneeId,
        epicId: params.epic ? this.resolveEpic(db, p.id, params.epic) : null,
        sprintId: params.sprint ? this.resolveSprint(db, actor, p.id, params.sprint) : null,
      };
      const err = validateTask(db, fields, p.id, null);
      if (err) throw new ValidationError(err);
      db.taskCounters[p.id] = (db.taskCounters[p.id] ?? 0) + 1;
      const now = new Date().toISOString();
      const t: Task = {
        id: uid('tsk'),
        ref: `${p.key}-${100 + db.taskCounters[p.id]!}`,
        projectId: p.id,
        epicId: fields.epicId ?? null,
        parentId,
        type,
        title: params.title.trim(),
        desc: fields.desc ?? '',
        status: 'todo',
        priority: fields.priority ?? 'medium',
        assigneeId,
        teamId: p.teamIds[0] ?? null,
        sprintId: fields.sprintId ?? null,
        labels: fields.labels ?? [],
        acceptance: [],
        blockedBy: [],
        createdAt: now,
        updatedAt: now,
        doneAt: null,
        dueDate: fields.dueDate || null,
        createdBy: actor.user.id,
      };
      db.tasks.push(t);
      this.audit.record(db, actor, { action: 'create', entityType: 'task', entityId: t.id, projectId: p.id, after: { title: t.title, status: t.status }, summary: `criou a tarefa ${t.ref}` });
      this.events.emit(db, actor, 'task.created.v1', p.id, t.id, { task: t.ref, title: t.title });
      if (t.assigneeId) this.emitAssigned(db, actor, t);
      return taskDetail(db, t, actor.user);
    });
  }

  async update(actor: Actor, ref: string, input: UpdateTaskFields) {
    return this.store.transaction((db) => {
      const t = this.writable(db, actor, ref, 'editar a tarefa');
      const fields: TaskFields = {};
      if (input.title !== undefined) fields.title = input.title.trim();
      if (input.description !== undefined) fields.desc = input.description;
      if (input.priority !== undefined) fields.priority = input.priority;
      if (input.dueDate !== undefined) fields.dueDate = input.dueDate === '' ? null : input.dueDate;
      if (input.labels !== undefined) fields.labels = input.labels;
      if (input.acceptance !== undefined) fields.acceptance = input.acceptance;
      if (input.epic !== undefined) fields.epicId = input.epic === null ? null : this.resolveEpic(db, t.projectId, input.epic);
      if (!Object.keys(fields).length) throw new ValidationError('Informe ao menos um campo: title, description, priority, dueDate, labels, acceptance ou epic.');
      const changed = this.applyUpdate(db, actor, t, fields);
      return { changed, task: taskDetail(db, t, actor.user) };
    });
  }

  async move(actor: Actor, ref: string, status: TaskStatus) {
    if (!can(actor.user, 'task.move')) throw await this.audit.deny(actor, 'mover tarefas');
    return this.store.transaction((db) => {
      const t = this.writable(db, actor, ref, 'mover a tarefa');
      const changed = this.applyUpdate(db, actor, t, { status });
      return { changed, task: taskSummary(db, t), doneAt: t.doneAt };
    });
  }

  async assign(actor: Actor, ref: string, assignee: string | null) {
    return this.store.transaction((db) => {
      const t = this.writable(db, actor, ref, 'atribuir a tarefa');
      let assigneeId: string | null = null;
      if (assignee !== null) {
        const member = findMember(db, t.projectId, assignee);
        if (!member) throw new ValidationError('Responsável não encontrado entre os membros das equipes do projeto — use nome completo, e-mail ou id.');
        assigneeId = member.id;
      }
      const changed = this.applyUpdate(db, actor, t, { assigneeId });
      return { changed, task: taskSummary(db, t) };
    });
  }

  async comment(actor: Actor, ref: string, text: string) {
    return this.store.transaction((db) => {
      const t = this.writable(db, actor, ref, 'comentar na tarefa');
      if (!can(actor.user, 'task.create')) throw this.audit.denial(db, actor, `comentar na tarefa ${t.ref}`);
      if (!strOk(text, 4000, true)) throw new ValidationError('O comentário deve ter de 1 a 4000 caracteres.');
      db.comments.push({ id: uid('cm'), taskId: t.id, userId: actor.user.id, text, createdAt: new Date().toISOString() });
      this.audit.record(db, actor, { action: 'comment', entityType: 'task', entityId: t.id, projectId: t.projectId, summary: `comentou em ${t.ref}` });
      // menções: @Nome Sobrenome
      const mentioned = db.users.filter((u) => u.id !== actor.user.id && text.includes(`@${u.name}`));
      for (const u of mentioned) {
        this.events.emit(db, actor, 'comment.mention.v1', t.projectId, t.id, { task: t.ref, mentioned: u.id, vars: { ref: t.ref, autor: actor.user.name } });
      }
      return { task: t.ref, comments: db.comments.filter((c) => c.taskId === t.id).length, mentioned: mentioned.map((u) => u.name) };
    });
  }

  async linkDependency(actor: Actor, ref: string, blockerRef: string) {
    return this.store.transaction((db) => {
      const t = this.writable(db, actor, ref, 'alterar dependências da tarefa');
      const blocker = this.visibleTask(db, actor, blockerRef, `usar como bloqueadora de ${t.ref} a tarefa`);
      if (t.blockedBy.includes(blocker.id)) throw new ConflictError(`${t.ref} já depende de ${blocker.ref}.`);
      this.applyUpdate(db, actor, t, { blockedBy: [...t.blockedBy, blocker.id] });
      return { task: t.ref, blockedBy: this.refs(db, t.blockedBy), blocked: isBlocked(db, t) };
    });
  }

  async unlinkDependency(actor: Actor, ref: string, blockerRef: string) {
    return this.store.transaction((db) => {
      const t = this.writable(db, actor, ref, 'alterar dependências da tarefa');
      const blocker = this.visibleTask(db, actor, blockerRef, `remover de ${t.ref} a dependência da tarefa`);
      if (!t.blockedBy.includes(blocker.id)) throw new ValidationError(`${t.ref} não depende de ${blocker.ref}.`);
      this.applyUpdate(db, actor, t, { blockedBy: t.blockedBy.filter((b) => b !== blocker.id) });
      return { task: t.ref, blockedBy: this.refs(db, t.blockedBy), blocked: isBlocked(db, t) };
    });
  }

  /** Quadro Kanban do projeto: tarefas (sem subtarefas) agrupadas por status. */
  board(actor: Actor, projectRef: string) {
    return this.store.read((db) => {
      const p = findProject(db as Db, actor.user, projectRef);
      if (!p) throw new NotFoundError(`Projeto "${projectRef}" não encontrado ou fora do seu escopo de acesso.`);
      const tasks = db.tasks.filter((t) => t.projectId === p.id && !t.parentId);
      const sprint = db.sprints.find((s) => s.projectId === p.id && s.status === 'active') ?? null;
      return {
        project: { key: p.key, name: p.name },
        activeSprint: sprint ? { name: sprint.name, goal: sprint.goal, endDate: sprint.endDate } : null,
        columns: (Object.keys(STATUS_LABELS) as TaskStatus[]).map((status) => ({
          status,
          label: STATUS_LABELS[status],
          tasks: tasks.filter((t) => t.status === status).map((t) => taskSummary(db, t)),
        })),
      };
    });
  }

  /**
   * Núcleo de act.updateTask: escopo e papel, validação, diff, doneAt, auditoria por tipo de
   * mudança e eventos. Devolve os campos alterados (vazio quando nada mudou).
   */
  applyUpdate(db: Db, actor: Actor, t: Task, fields: TaskFields): string[] {
    if (!canTouchTask(db, actor.user, t)) throw this.audit.denial(db, actor, `editar a tarefa ${t.ref}`);
    if ('assigneeId' in fields && (fields.assigneeId ?? null) !== (t.assigneeId ?? null) && !assignAllowed(actor.user, t.assigneeId, fields.assigneeId ?? null)) {
      throw this.audit.denial(db, actor, 'atribuir tarefas a outras pessoas');
    }
    const err = validateTask(db, fields, t.projectId, t);
    if (err) throw new ValidationError(err);
    const target = t as unknown as Record<string, unknown>;
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (!sameValue(k, target[k], v)) {
        before[k] = target[k];
        after[k] = v;
        target[k] = v;
      }
    }
    const changed = Object.keys(after);
    if (!changed.length) return changed;
    t.updatedAt = new Date().toISOString();
    // data de conclusão real: KPIs de entrega não mudam quando uma tarefa concluída é editada
    if ('status' in after) t.doneAt = after.status === 'done' ? t.updatedAt : null;
    const base = { entityType: 'task', entityId: t.id, projectId: t.projectId };

    if ('status' in after) {
      const from = before.status as TaskStatus;
      const to = after.status as TaskStatus;
      this.audit.record(db, actor, { ...base, action: 'status', before: { status: from }, after: { status: to }, summary: `moveu ${t.ref} de ${STATUS_LABELS[from]} para ${STATUS_LABELS[to]}` });
      this.events.emit(db, actor, 'task.status_changed.v1', t.projectId, t.id, { task: t.ref, from, to });
      if (to === 'done') this.events.emit(db, actor, 'task.completed.v1', t.projectId, t.id, { task: t.ref });
    }
    if ('assigneeId' in after) {
      const toUser = after.assigneeId ? db.users.find((u) => u.id === after.assigneeId) : undefined;
      this.audit.record(db, actor, { ...base, action: 'assign', before: { assigneeId: before.assigneeId }, after: { assigneeId: after.assigneeId }, summary: `atribuiu ${t.ref} ${toUser ? `a ${toUser.name}` : 'a ninguém'}` });
      if (toUser) this.emitAssigned(db, actor, t);
    }
    if ('blockedBy' in after) {
      const prev = (before.blockedBy as string[]) ?? [];
      const next = after.blockedBy as string[];
      for (const blockerId of next.filter((b) => !prev.includes(b))) {
        const blocker = db.tasks.find((x) => x.id === blockerId);
        this.audit.record(db, actor, { ...base, action: 'block', after: { blockedBy: blockerId }, summary: `${t.ref} bloqueada por ${blocker?.ref ?? '?'}` });
        this.events.emit(db, actor, 'task.blocked.v1', t.projectId, t.id, { task: t.ref, assignee: t.assigneeId, vars: { ref: t.ref, bloqueio: blocker?.ref ?? '?' } });
      }
      for (const blockerId of prev.filter((b) => !next.includes(b))) {
        const blocker = db.tasks.find((x) => x.id === blockerId);
        this.audit.record(db, actor, { ...base, action: 'unblock', before: { blockedBy: blockerId }, summary: `${t.ref} deixou de depender de ${blocker?.ref ?? 'tarefa removida'}` });
      }
    }
    const other = changed.filter((k) => !['status', 'assigneeId', 'blockedBy'].includes(k));
    if (other.length) {
      const ob = Object.fromEntries(other.map((k) => [k, before[k]]));
      const oa = Object.fromEntries(other.map((k) => [k, after[k]]));
      this.audit.record(db, actor, { ...base, action: other.includes('priority') ? 'priority' : 'update', before: ob, after: oa, summary: `atualizou ${t.ref} (${other.join(', ')})` });
    }
    return changed;
  }

  private emitAssigned(db: Db, actor: Actor, t: Task): void {
    const u = db.users.find((x) => x.id === t.assigneeId);
    const p = db.projects.find((x) => x.id === t.projectId);
    if (!u || !p) return;
    this.events.emit(db, actor, 'task.assigned.v1', t.projectId, t.id, {
      task: t.ref,
      assignee: u.id,
      vars: { ref: t.ref, nome: u.name.split(' ')[0], titulo: t.title, projeto: p.name },
    });
  }

  /** Tarefa alvo de uma mutação: inexistente ou fora do escopo respondem igual ao agente. */
  private writable(db: Db, actor: Actor, ref: string, what: string): Task {
    const t = rawTask(db, ref);
    if (!t) throw new NotFoundError(this.notFound(ref));
    if (!canSeeProject(db, actor.user, t.projectId)) throw this.audit.outOfScope(actor, `${what} ${t.ref}`, this.notFound(ref));
    return t;
  }

  /** Tarefa citada numa mutação de outra (ex.: a bloqueadora): fora do escopo também é auditada. */
  private visibleTask(db: Db, actor: Actor, ref: string, what: string): Task {
    const t = rawTask(db, ref);
    if (!t) throw new NotFoundError(this.notFound(ref));
    if (!canSeeProject(db, actor.user, t.projectId)) throw this.audit.outOfScope(actor, `${what} ${t.ref}`, this.notFound(ref));
    return t;
  }

  private notFound(ref: string): string {
    return `Tarefa "${ref}" não encontrada ou fora do seu escopo de acesso.`;
  }

  private refs(db: Db, ids: string[]): string[] {
    return ids.map((id) => db.tasks.find((t) => t.id === id)?.ref ?? id);
  }

  private resolveEpic(db: Db, projectId: string, ref: string): string {
    const key = ref.trim().toLowerCase();
    const ep = db.epics.find((e) => e.projectId === projectId && (e.id === ref.trim() || e.name.toLowerCase() === key));
    if (!ep) throw new ValidationError(`Épico "${ref}" não encontrado neste projeto.`);
    return ep.id;
  }

  private resolveSprint(db: Db, actor: Actor, projectId: string, ref: string): string {
    const p = db.projects.find((x) => x.id === projectId)!;
    const sp = findSprint(db, actor.user, ref, p.key);
    if (!sp) throw new ValidationError(`Sprint "${ref}" não encontrada no projeto ${p.key}.`);
    return sp.id;
  }

  /** undefined = sem filtro; null = sem responsável. Aceita "me" e "none". */
  private assigneeFilter(db: Db, actor: Actor, who?: string): string | null | undefined {
    if (!who) return undefined;
    if (who === 'me') return actor.user.id;
    if (who === 'none') return null;
    const u = matchUser(scopeUsers(db, actor.user), who);
    if (!u) throw new NotFoundError(`Responsável "${who}" não encontrado no seu escopo.`);
    return u.id;
  }

  private sprintFilter(db: Db, actor: Actor, ref: string, projectId?: string): Set<string> {
    const key = ref.trim().toLowerCase();
    const ids = db.sprints
      .filter((s) => (s.id === ref.trim() || s.name.toLowerCase() === key) && (!projectId || s.projectId === projectId) && canSeeProject(db, actor.user, s.projectId))
      .map((s) => s.id);
    if (!ids.length) throw new NotFoundError(`Sprint "${ref}" não encontrada.`);
    return new Set(ids);
  }
}
