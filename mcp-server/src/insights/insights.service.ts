import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { can, scopeTeams, visibleProjects } from '../domain/access.js';
import type { Actor } from '../domain/actor.js';
import { STATUS_LABELS, TASK_STATUSES } from '../domain/constants.js';
import { NotFoundError } from '../domain/errors.js';
import { findProject } from '../domain/lookup.js';
import { isOverdue, onTimeRate, projectProgress, projectRisk } from '../domain/metrics.js';
import type { Db } from '../domain/model.js';
import { StateStore } from '../state/state.store.js';

export interface InsightsFilters {
  project?: string;
  team?: string;
  periodDays?: number;
}

const DAY = 86_400_000;

/** KPIs da Visão executiva do Insights (views-insights.js), com os mesmos filtros e escopo. */
@Injectable()
export class InsightsService {
  constructor(
    private readonly store: StateStore,
    private readonly audit: AuditService,
  ) {}

  async summary(actor: Actor, filters: InsightsFilters = {}) {
    if (!can(actor.user, 'insights.view')) throw await this.audit.deny(actor, 'ver indicadores do Insights');
    return this.store.read((db) => this.compute(db as Db, actor, filters));
  }

  private compute(db: Db, actor: Actor, filters: InsightsFilters) {
    const period = filters.periodDays ?? 90;
    const project = filters.project ? findProject(db, actor.user, filters.project) : null;
    if (filters.project && !project) throw new NotFoundError(`Projeto "${filters.project}" não encontrado ou fora do seu escopo de acesso.`);
    const teams = scopeTeams(db, actor.user);
    const team = filters.team ? teams.find((t) => t.id === filters.team || t.name.toLowerCase() === filters.team!.toLowerCase()) : null;
    if (filters.team && !team) throw new NotFoundError(`Equipe "${filters.team}" não encontrada no seu escopo.`);

    const projects = visibleProjects(db, actor.user).filter((p) => (!project || p.id === project.id) && (!team || p.teamIds.includes(team.id)));
    const ids = new Set(projects.map((p) => p.id));
    const tasks = db.tasks.filter((t) => ids.has(t.projectId) && !t.parentId && (!team || t.teamId === team.id));
    const now = Date.now();
    const cutoff = now - period * DAY;
    const doneInPeriod = tasks.filter((t) => t.status === 'done' && t.doneAt && new Date(t.doneAt).getTime() >= cutoff);

    const weeks = Math.min(13, Math.max(6, Math.round(period / 7)));
    const weekly = Array.from({ length: weeks }, (_, k) => {
      const i = weeks - 1 - k;
      const start = now - (i + 1) * 7 * DAY;
      const end = now - i * 7 * DAY;
      const done = tasks.filter((t) => {
        const ts = t.doneAt ? new Date(t.doneAt).getTime() : Number.NaN;
        return t.status === 'done' && ts >= start && ts < end;
      }).length;
      return { weekEnding: new Date(end).toISOString().slice(0, 10), done };
    });

    const situation = { healthy: 0, attention: 0, atRisk: 0, delivered: 0 };
    for (const p of projects) {
      if (p.status === 'done') situation.delivered++;
      else {
        const level = projectRisk(db, p).level;
        if (level === 'high') situation.atRisk++;
        else if (level === 'mid') situation.attention++;
        else situation.healthy++;
      }
    }

    const byTeam = teams
      .map((tm) => {
        const tts = tasks.filter((t) => t.teamId === tm.id);
        const open = tts.filter((t) => t.status !== 'done').length;
        return { team: tm.name, open, done: tts.length - open, overdue: tts.filter((t) => isOverdue(t)).length, onTimeRate: onTimeRate(tts), total: tts.length };
      })
      .filter((x) => x.total > 0)
      .map(({ total: _total, ...rest }) => rest);

    return {
      filters: { project: project?.key ?? null, team: team?.name ?? null, periodDays: period },
      kpis: {
        activeProjects: projects.filter((p) => p.status === 'active').length,
        projectsInScope: projects.length,
        doneProjects: projects.filter((p) => p.status === 'done').length,
        projectsAtRisk: projects.filter((p) => p.status === 'active' && projectRisk(db, p).level === 'high').length,
        tasksDoneInPeriod: doneInPeriod.length,
        overdueTasks: tasks.filter((t) => isOverdue(t)).length,
        onTimeRate: onTimeRate(tasks),
      },
      tasksByStatus: TASK_STATUSES.map((s) => ({ status: s, label: STATUS_LABELS[s], count: tasks.filter((t) => t.status === s).length })),
      projectSituation: situation,
      weeklyCompletions: weekly,
      teams: byTeam,
      projects: projects.map((p) => {
        const risk = projectRisk(db, p);
        return { key: p.key, name: p.name, status: p.status, progress: projectProgress(db, p.id), risk: risk.label, overdue: risk.late, blocked: risk.blocked, targetDate: p.targetDate ?? null };
      }),
    };
  }
}
