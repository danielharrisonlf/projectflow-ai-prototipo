import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { can, canSeeProject, inMyOrg, visibleProjects } from '../domain/access.js';
import type { Actor } from '../domain/actor.js';
import type { Capability } from '../domain/constants.js';
import { todayLocal } from '../domain/dates.js';
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors.js';
import { uid } from '../domain/ids.js';
import { matchUser, rawProject } from '../domain/lookup.js';
import type { Db, Priority, Project, ProjectStatus } from '../domain/model.js';
import { sameValue, validateProject, type ProjectFields } from '../domain/validation.js';
import { EventsService } from '../events/events.service.js';
import { StateStore } from '../state/state.store.js';
import { projectDetail, projectSummary } from './project.presenter.js';

export interface ListProjectsParams {
  status?: ProjectStatus | 'archived';
}

export interface CreateProjectParams {
  name: string;
  key: string;
  description?: string;
  priority?: Priority;
  startDate?: string;
  targetDate?: string;
  teams?: string[];
  lead?: string;
}

export interface UpdateProjectParams {
  project: string;
  fields: {
    name?: string;
    description?: string;
    priority?: Priority;
    status?: ProjectStatus;
    startDate?: string | null;
    targetDate?: string | null;
    lead?: string;
  };
}

/** Projetos: listagem com escopo, criação, edição, arquivamento e exclusão (act.*Project de core.js). */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly store: StateStore,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  list(actor: Actor, params: ListProjectsParams = {}) {
    return this.store.read((db) => {
      const wantArchived = params.status === 'archived';
      const canSeeArchived = can(actor.user, 'project.archive') || can(actor.user, 'audit.view');
      const list = visibleProjects(db as Db, actor.user, { includeArchived: wantArchived }).filter((p) =>
        wantArchived ? p.archived && canSeeArchived : !params.status || p.status === params.status,
      );
      return { count: list.length, projects: list.map((p) => projectSummary(db, p)) };
    });
  }

  get(actor: Actor, ref: string) {
    return this.store.read((db) => projectDetail(db, this.visible(db as Db, actor, ref)));
  }

  async create(actor: Actor, params: CreateProjectParams) {
    await this.requireCap(actor, 'project.create', 'criar projetos');
    return this.store.transaction((db) => {
      const fields: ProjectFields = {
        name: params.name,
        key: params.key,
        desc: params.description ?? '',
        ...(params.priority && { priority: params.priority }),
        ...(params.startDate && { startDate: params.startDate }),
        ...(params.targetDate && { targetDate: params.targetDate }),
      };
      const err = validateProject(fields, null);
      if (err) throw new ValidationError(err);
      const key = params.key.toUpperCase();
      if (db.projects.some((p) => p.key === key)) throw new ConflictError(`A chave ${key} já é usada por outro projeto.`);
      const teamIds = (params.teams ?? []).map((t) => this.resolveTeam(db, actor, t));
      const lead = params.lead ? this.resolveLead(db, params.lead, actor.user.orgId) : actor.user.id;
      const p: Project = {
        id: uid('prj'),
        orgId: actor.user.orgId,
        key,
        name: params.name.trim(),
        desc: params.description ?? '',
        teamIds,
        leadId: lead,
        priority: params.priority ?? 'medium',
        status: 'active',
        startDate: params.startDate ?? todayLocal(),
        targetDate: params.targetDate ?? null,
        archived: false,
        createdAt: new Date().toISOString(),
        color: '#2B5FD9',
      };
      db.projects.push(p);
      db.taskCounters[p.id] = 0;
      this.audit.record(db, actor, {
        action: 'create',
        entityType: 'project',
        entityId: p.id,
        projectId: p.id,
        after: { name: p.name, key: p.key },
        summary: `criou o projeto ${p.name}`,
      });
      this.events.emit(db, actor, 'project.created.v1', p.id, p.id, { project: p.name, key: p.key });
      return projectDetail(db, p);
    });
  }

  async update(actor: Actor, params: UpdateProjectParams) {
    await this.requireCap(actor, 'project.edit', 'editar projetos');
    return this.store.transaction((db) => {
      const p = this.writable(db, actor, params.project, 'editar o projeto');
      const { description, lead, ...rest } = params.fields;
      const fields: Record<string, unknown> = { ...rest };
      if (description !== undefined) fields.desc = description;
      if (lead !== undefined) fields.leadId = this.resolveLead(db, lead, p.orgId);
      const err = validateProject(fields as ProjectFields, p);
      if (err) throw new ValidationError(err);
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      const target = p as unknown as Record<string, unknown>;
      for (const [k, v] of Object.entries(fields)) {
        if (!sameValue(k, target[k], v)) {
          before[k] = target[k];
          after[k] = v;
          target[k] = v;
        }
      }
      const changed = Object.keys(after);
      if (changed.length) {
        this.audit.record(db, actor, { action: 'update', entityType: 'project', entityId: p.id, projectId: p.id, before, after, summary: `atualizou o projeto ${p.name}` });
        this.events.emit(db, actor, 'project.updated.v1', p.id, p.id, { project: p.name, fields: changed });
      }
      return { changed, project: projectDetail(db, p) };
    });
  }

  async archive(actor: Actor, ref: string) {
    await this.requireCap(actor, 'project.archive', 'arquivar projetos');
    return this.store.transaction((db) => {
      const p = this.writable(db, actor, ref, 'arquivar o projeto', { includeArchived: true });
      if (p.archived) throw new ConflictError(`O projeto ${p.key} já está arquivado.`);
      p.archived = true;
      this.audit.record(db, actor, { action: 'archive', entityType: 'project', entityId: p.id, projectId: p.id, before: { archived: false }, after: { archived: true }, summary: `arquivou o projeto ${p.name}` });
      this.events.emit(db, actor, 'project.archived.v1', p.id, p.id, { project: p.name, key: p.key });
      return projectSummary(db, p);
    });
  }

  async unarchive(actor: Actor, ref: string) {
    await this.requireCap(actor, 'project.archive', 'desarquivar projetos');
    return this.store.transaction((db) => {
      const p = this.writable(db, actor, ref, 'desarquivar o projeto', { includeArchived: true });
      if (!p.archived) throw new ConflictError(`O projeto ${p.key} não está arquivado.`);
      p.archived = false;
      this.audit.record(db, actor, { action: 'unarchive', entityType: 'project', entityId: p.id, projectId: p.id, before: { archived: true }, after: { archived: false }, summary: `desarquivou o projeto ${p.name}` });
      this.events.emit(db, actor, 'project.unarchived.v1', p.id, p.id, { project: p.name, key: p.key });
      return projectSummary(db, p);
    });
  }

  /** Confere, sem alterar nada, o que seria excluído (usado antes de pedir confirmação). */
  async previewDelete(actor: Actor, ref: string) {
    await this.requireCap(actor, 'project.delete', 'excluir projetos');
    // dentro de uma transação para que a tentativa fora do escopo fique na auditoria; nada é alterado
    return this.store.transaction((db) => {
      const p = this.writable(db, actor, ref, 'excluir o projeto', { includeArchived: true });
      const tasks = db.tasks.filter((t) => t.projectId === p.id).length;
      return { key: p.key, name: p.name, tasks, sprints: db.sprints.filter((s) => s.projectId === p.id).length };
    });
  }

  /** Exclusão em cascata sem deixar nada órfão (act.deleteProject de core.js). */
  async delete(actor: Actor, ref: string) {
    await this.requireCap(actor, 'project.delete', 'excluir projetos');
    return this.store.transaction((db) => {
      const p = this.writable(db, actor, ref, 'excluir o projeto', { includeArchived: true });
      const id = p.id;
      const taskIds = new Set(db.tasks.filter((t) => t.projectId === id).map((t) => t.id));
      db.projects = db.projects.filter((x) => x.id !== id);
      db.tasks = db.tasks.filter((t) => t.projectId !== id);
      db.epics = db.epics.filter((x) => x.projectId !== id);
      db.sprints = db.sprints.filter((x) => x.projectId !== id);
      db.milestones = db.milestones.filter((x) => x.projectId !== id);
      db.comments = db.comments.filter((c) => !taskIds.has(c.taskId));
      for (const t of db.tasks) if (t.blockedBy.some((b) => taskIds.has(b))) t.blockedBy = t.blockedBy.filter((b) => !taskIds.has(b));
      for (const u of db.users) if (u.favoriteProjectIds) u.favoriteProjectIds = u.favoriteProjectIds.filter((x) => x !== id);
      delete db.taskCounters[id];
      if (db.settings.currentProjectId === id) db.settings.currentProjectId = null;
      this.audit.record(db, actor, { action: 'delete', entityType: 'project', entityId: id, projectId: id, before: { name: p.name }, summary: `excluiu o projeto ${p.name}` });
      return { key: p.key, name: p.name, deletedTasks: taskIds.size };
    });
  }

  private visible(db: Db, actor: Actor, ref: string): Project {
    const canSeeArchived = can(actor.user, 'project.archive') || can(actor.user, 'audit.view');
    const p = rawProject(db, ref);
    if (!p || !canSeeProject(db, actor.user, p.id, { includeArchived: canSeeArchived })) {
      throw new NotFoundError(`Projeto "${ref}" não encontrado ou fora do seu escopo de acesso.`);
    }
    return p;
  }

  /** Projeto alvo de uma mutação: inexistente ou fora do escopo respondem igual ao agente. */
  private writable(db: Db, actor: Actor, ref: string, what: string, opts: { includeArchived?: boolean } = {}): Project {
    const p = rawProject(db, ref);
    const message = `Projeto "${ref}" não encontrado ou fora do seu escopo de acesso.`;
    if (!p) throw new NotFoundError(message);
    if (!canSeeProject(db, actor.user, p.id, opts)) throw this.audit.outOfScope(actor, `${what} ${p.key}`, message);
    return p;
  }

  private async requireCap(actor: Actor, cap: Capability, what: string): Promise<void> {
    if (!can(actor.user, cap)) throw await this.audit.deny(actor, what);
  }

  private resolveTeam(db: Db, actor: Actor, ref: string): string {
    const key = ref.trim().toLowerCase();
    const team = db.teams.find((t) => (t.id === ref.trim() || t.name.toLowerCase() === key) && t.orgId === actor.user.orgId);
    if (!team || !inMyOrg(actor.user, team.orgId)) throw new ValidationError(`Equipe "${ref}" não encontrada na sua organização.`);
    return team.id;
  }

  private resolveLead(db: Db, ref: string, orgId: string): string {
    const user = matchUser(db.users.filter((u) => u.orgId === orgId && !u.invited), ref);
    if (!user) throw new ValidationError(`Responsável "${ref}" não encontrado na organização do projeto.`);
    return user.id;
  }
}
