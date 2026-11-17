import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { can, canSeeProject } from '../domain/access.js';
import type { Actor } from '../domain/actor.js';
import { isDateOnly } from '../domain/dates.js';
import { ConflictError, DomainError, NotFoundError, ValidationError } from '../domain/errors.js';
import { uid } from '../domain/ids.js';
import { findProject, findSprint, rawProject, rawTask } from '../domain/lookup.js';
import type { Db, Sprint, SprintStatus } from '../domain/model.js';
import { strOk } from '../domain/validation.js';
import { EventsService } from '../events/events.service.js';
import { StateStore } from '../state/state.store.js';
import { taskSummary } from '../tasks/task.presenter.js';
import { TasksService } from '../tasks/tasks.service.js';

export interface CreateSprintParams {
  project: string;
  name: string;
  goal?: string;
  startDate: string;
  endDate: string;
}

export interface BatchOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number, message: string) => Promise<void> | void;
}

export interface AssignResult {
  ref: string;
  ok: boolean;
  detail: string;
}

/** Sprints: planejar, iniciar (uma ativa por projeto), encerrar e associar tarefas. */
@Injectable()
export class SprintsService {
  constructor(
    private readonly store: StateStore,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly tasks: TasksService,
  ) {}

  list(actor: Actor, params: { project?: string; status?: SprintStatus } = {}) {
    return this.store.read((db) => {
      const p = params.project ? findProject(db as Db, actor.user, params.project) : null;
      if (params.project && !p) throw new NotFoundError(`Projeto "${params.project}" não encontrado ou fora do seu escopo de acesso.`);
      const list = db.sprints.filter(
        (s) => (!p || s.projectId === p.id) && (!params.status || s.status === params.status) && canSeeProject(db as Db, actor.user, s.projectId),
      );
      return { count: list.length, sprints: list.map((s) => this.summary(db, s)) };
    });
  }

  get(actor: Actor, ref: string, project?: string) {
    return this.store.read((db) => {
      const s = findSprint(db as Db, actor.user, ref, project);
      if (!s) throw new NotFoundError(`Sprint "${ref}" não encontrada ou fora do seu escopo de acesso.`);
      return {
        ...this.summary(db, s),
        tasks: db.tasks.filter((t) => t.sprintId === s.id && !t.parentId).map((t) => taskSummary(db, t)),
      };
    });
  }

  async create(actor: Actor, params: CreateSprintParams) {
    if (!can(actor.user, 'sprint.manage')) throw await this.audit.deny(actor, 'criar sprints');
    return this.store.transaction((db) => {
      const p = rawProject(db, params.project);
      const missing = `Projeto "${params.project}" não encontrado ou fora do seu escopo de acesso.`;
      if (!p) throw new NotFoundError(missing);
      if (!canSeeProject(db, actor.user, p.id)) throw this.audit.outOfScope(actor, `criar sprints no projeto ${p.key}`, missing);
      if (!strOk(params.name, 40, true)) throw new ValidationError('O nome da sprint é obrigatório (até 40 caracteres).');
      if (!isDateOnly(params.startDate) || !isDateOnly(params.endDate) || params.endDate <= params.startDate) {
        throw new ValidationError('Datas inválidas: use AAAA-MM-DD e um término depois do início.');
      }
      const name = params.name.trim();
      if (db.sprints.some((s) => s.projectId === p.id && s.name.trim().toLowerCase() === name.toLowerCase())) {
        throw new ConflictError('Já existe uma sprint com esse nome neste projeto.');
      }
      const s: Sprint = { id: uid('sp'), projectId: p.id, name, goal: params.goal ?? '', status: 'planned', startDate: params.startDate, endDate: params.endDate };
      db.sprints.push(s);
      this.audit.record(db, actor, { action: 'create', entityType: 'sprint', entityId: s.id, projectId: p.id, after: { name: s.name }, summary: `criou a ${s.name}` });
      return this.summary(db, s);
    });
  }

  async start(actor: Actor, ref: string, project?: string) {
    if (!can(actor.user, 'sprint.manage')) throw await this.audit.deny(actor, 'iniciar sprints');
    return this.store.transaction((db) => {
      const s = this.writable(db, actor, ref, project);
      if (s.status !== 'planned') throw new ConflictError('Só sprints planejadas podem ser iniciadas.');
      // uma sprint ativa por projeto
      const running = db.sprints.find((x) => x.projectId === s.projectId && x.status === 'active');
      if (running) throw new ConflictError(`Já existe uma sprint ativa: encerre a ${running.name} antes de iniciar a ${s.name}.`);
      s.status = 'active';
      const p = db.projects.find((x) => x.id === s.projectId)!;
      this.audit.record(db, actor, { action: 'sprint_start', entityType: 'sprint', entityId: s.id, projectId: s.projectId, before: { status: 'planned' }, after: { status: 'active' }, summary: `iniciou a ${s.name}` });
      this.events.emit(db, actor, 'sprint.started.v1', s.projectId, s.id, { sprint: s.name, vars: { sprint: s.name, projeto: p.name, meta: s.goal } });
      return this.summary(db, s);
    });
  }

  /** Encerra a sprint ativa; tarefas abertas voltam ao backlog (sem sprint). */
  async close(actor: Actor, ref: string, project?: string) {
    if (!can(actor.user, 'sprint.manage')) throw await this.audit.deny(actor, 'encerrar sprints');
    return this.store.transaction((db) => {
      const s = this.writable(db, actor, ref, project);
      if (s.status !== 'active') throw new ConflictError('Só a sprint ativa pode ser encerrada.');
      s.status = 'done';
      const done = db.tasks.filter((t) => t.sprintId === s.id && t.status === 'done').length;
      const open = db.tasks.filter((t) => t.sprintId === s.id && t.status !== 'done');
      for (const t of open) t.sprintId = null;
      this.audit.record(db, actor, {
        action: 'sprint_end',
        entityType: 'sprint',
        entityId: s.id,
        projectId: s.projectId,
        before: { status: 'active' },
        after: { status: 'done' },
        summary: `encerrou a ${s.name} (${done} concluídas, ${open.length} devolvidas ao backlog)`,
      });
      this.events.emit(db, actor, 'sprint.completed.v1', s.projectId, s.id, { sprint: s.name, done, vars: { sprint: s.name, feitas: String(done) } });
      return { sprint: this.summary(db, s), doneTasks: done, returnedToBacklog: open.map((t) => t.ref) };
    });
  }

  /**
   * Associa (ou, com sprint null, desassocia) um lote de tarefas, uma a uma: cada tarefa passa
   * pelas regras de edição; falhas não interrompem o lote; o cancelamento do cliente para o lote.
   */
  async assignTasks(actor: Actor, params: { sprint: string | null; project?: string; refs: string[] }, options: BatchOptions = {}) {
    if (!can(actor.user, 'sprint.manage')) throw await this.audit.deny(actor, 'associar tarefas a sprints');
    const sprint = params.sprint === null ? null : this.store.read((db) => findSprint(db as Db, actor.user, params.sprint!, params.project));
    if (params.sprint !== null && !sprint) throw new NotFoundError(`Sprint "${params.sprint}" não encontrada ou fora do seu escopo de acesso.`);
    if (sprint?.status === 'done') throw new ConflictError(`A ${sprint.name} já foi encerrada; escolha uma sprint ativa ou planejada.`);
    const results: AssignResult[] = [];
    const total = params.refs.length;
    for (const [i, ref] of params.refs.entries()) {
      if (options.signal?.aborted) break;
      results.push(await this.assignOne(actor, ref, sprint));
      await options.onProgress?.(i + 1, total, `${ref}: ${results.at(-1)!.detail}`);
    }
    return {
      sprint: sprint ? sprint.name : null,
      processed: results.length,
      cancelled: results.length < total,
      succeeded: results.filter((r) => r.ok).length,
      results,
    };
  }

  private async assignOne(actor: Actor, ref: string, sprint: Sprint | null): Promise<AssignResult> {
    try {
      return await this.store.transaction((db) => {
        const t = rawTask(db, ref);
        if (!t || !canSeeProject(db, actor.user, t.projectId)) throw new NotFoundError('não encontrada ou fora do seu escopo');
        if (sprint && t.projectId !== sprint.projectId) throw new ValidationError(`é de outro projeto que a ${sprint.name}`);
        const changed = this.tasks.applyUpdate(db, actor, t, { sprintId: sprint?.id ?? null });
        return { ref: t.ref, ok: true, detail: changed.length ? (sprint ? `associada à ${sprint.name}` : 'devolvida ao backlog') : 'já estava assim' };
      });
    } catch (error) {
      if (error instanceof DomainError) return { ref, ok: false, detail: error.message };
      throw error;
    }
  }

  private writable(db: Db, actor: Actor, ref: string, project?: string): Sprint {
    const missing = `Sprint "${ref}" não encontrada ou fora do seu escopo de acesso.`;
    const s = findSprint(db, actor.user, ref, project);
    if (s) return s;
    const hidden = db.sprints.find((x) => x.id === ref.trim());
    if (hidden) throw this.audit.outOfScope(actor, `alterar a sprint ${hidden.name}`, missing);
    throw new NotFoundError(missing);
  }

  private summary(db: Readonly<Db>, s: Sprint) {
    const ts = db.tasks.filter((t) => t.sprintId === s.id && !t.parentId);
    const done = ts.filter((t) => t.status === 'done').length;
    return {
      id: s.id,
      name: s.name,
      project: db.projects.find((p) => p.id === s.projectId)?.key ?? s.projectId,
      status: s.status,
      goal: s.goal ?? '',
      startDate: s.startDate,
      endDate: s.endDate,
      tasks: ts.length,
      done,
      progress: ts.length ? Math.round((100 * done) / ts.length) : 0,
    };
  }
}
