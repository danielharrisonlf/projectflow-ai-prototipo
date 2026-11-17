import { Injectable } from '@nestjs/common';
import { roleName, scopeTeams, visibleProjects } from '../domain/access.js';
import type { Actor } from '../domain/actor.js';
import { NotFoundError } from '../domain/errors.js';
import { isBlocked, isOverdue, onTimeRate } from '../domain/metrics.js';
import type { Db } from '../domain/model.js';
import { StateStore } from '../state/state.store.js';
import { taskSummary } from '../tasks/task.presenter.js';

/** Equipes da organização (admin vê todas), com líder, integrantes e projetos visíveis. */
@Injectable()
export class TeamsService {
  constructor(private readonly store: StateStore) {}

  list(actor: Actor) {
    return this.store.read((db) => {
      const projects = visibleProjects(db as Db, actor.user);
      const teams = scopeTeams(db as Db, actor.user).map((t) => ({
        id: t.id,
        name: t.name,
        description: t.desc ?? '',
        org: db.orgs.find((o) => o.id === t.orgId)?.name ?? t.orgId,
        lead: t.leadId ? (db.users.find((u) => u.id === t.leadId)?.name ?? null) : null,
        members: t.memberIds.map((id) => {
          const u = db.users.find((x) => x.id === id);
          return { name: u?.name ?? id, role: u ? roleName(db as Db, u.roleId) : null, title: u?.title ?? null };
        }),
        projects: projects.filter((p) => p.teamIds.includes(t.id)).map((p) => p.key),
      }));
      return { count: teams.length, teams };
    });
  }

  /** Resumo dos últimos `days` dias de uma equipe: entregas, andamento, atrasos e bloqueios. */
  digest(actor: Actor, teamRef: string, days = 7) {
    return this.store.read((db) => {
      const key = teamRef.trim().toLowerCase();
      const team = scopeTeams(db as Db, actor.user).find((t) => t.id === teamRef.trim() || t.name.toLowerCase() === key);
      if (!team) throw new NotFoundError(`Equipe "${teamRef}" não encontrada no seu escopo.`);
      const visible = new Set(visibleProjects(db as Db, actor.user).map((p) => p.id));
      const tasks = db.tasks.filter((t) => t.teamId === team.id && !t.parentId && visible.has(t.projectId));
      const since = Date.now() - days * 86_400_000;
      const view = (t: (typeof tasks)[number]) => taskSummary(db, t);
      const doneRecently = tasks.filter((t) => t.status === 'done' && t.doneAt && new Date(t.doneAt).getTime() >= since);
      return {
        team: team.name,
        periodDays: days,
        members: team.memberIds.map((id) => db.users.find((u) => u.id === id)?.name ?? id),
        doneRecently: doneRecently.map(view),
        inProgress: tasks.filter((t) => t.status === 'in_progress').map(view),
        inReview: tasks.filter((t) => t.status === 'in_review').map(view),
        overdue: tasks.filter((t) => isOverdue(t)).map(view),
        blocked: tasks.filter((t) => isBlocked(db as Db, t)).map(view),
        onTimeRate: onTimeRate(tasks),
      };
    });
  }
}
