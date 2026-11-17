import { Injectable } from '@nestjs/common';
import { Prompt, type McpContext } from '@nestjs/mcp';
import * as z from 'zod';
import { ActorResolver } from '../identity/actor.resolver.js';
import { SCOPES } from '../mcp/auth/scopes.js';
import { RequiresCap } from '../mcp/guards/requires-cap.decorator.js';
import { ProjectsService } from '../projects/projects.service.js';
import { SprintsService } from '../sprints/sprints.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { TeamsService } from '../teams/teams.service.js';
import { promptMessages, taskList } from './prompt-format.js';

const PlanArgs = z.object({
  projeto: z.string().trim().min(2).max(40).describe('Chave do projeto (ex.: PCL).'),
  capacidade: z.string().regex(/^\d{1,3}$/, 'número de tarefas').describe('Quantas tarefas a equipe consegue entregar na sprint (ex.: 8).'),
});
const ProjectArgs = z.object({ projeto: z.string().trim().min(2).max(40).describe('Chave do projeto (ex.: PAG).') });
const RefineArgs = z.object({ ref: z.string().trim().min(3).max(40).describe('Ref da tarefa (ex.: PCL-104).') });
const WeeklyArgs = z.object({ equipe: z.string().trim().min(2).max(80).describe('Nome da equipe (ex.: Plataforma) ou id (tm-plat).') });

/** Prompts de planejamento: devolvem mensagens com o contexto real do estado já embutido. */
@Injectable()
export class PlanningPrompts {
  constructor(
    private readonly actors: ActorResolver,
    private readonly projects: ProjectsService,
    private readonly tasks: TasksService,
    private readonly sprints: SprintsService,
    private readonly teams: TeamsService,
  ) {}

  @Prompt({
    name: 'planejar-sprint',
    title: 'Planejar sprint',
    description: 'Monta a proposta da próxima sprint de um projeto a partir do backlog real, da capacidade informada, das prioridades, prazos e dependências.',
    argsSchema: PlanArgs,
    scopes: [SCOPES.projectsRead, SCOPES.tasksRead],
  })
  @RequiresCap('sprint.view')
  planSprint(args: z.infer<typeof PlanArgs>, ctx: McpContext) {
    const actor = this.actors.resolve(ctx);
    const project = this.projects.get(actor, args.projeto);
    const candidates = this.tasks.list(actor, { project: project.key, limit: 100 }).tasks.filter((t) => t.status === 'backlog' || t.status === 'todo');
    const sprints = this.sprints.list(actor, { project: project.key }).sprints.filter((s) => s.status !== 'done');
    const text = [
      `Planeje a próxima sprint do projeto ${project.key} — ${project.name} para uma capacidade de ${args.capacidade} tarefas.`,
      '',
      `Situação: ${project.progress}% concluído, risco "${project.risk.label}" (${project.risk.overdueTasks} atrasadas, ${project.risk.blockedTasks} bloqueadas), entrega prevista ${project.targetDate ?? 'sem data'}.`,
      `Sprints abertas: ${sprints.length ? sprints.map((s) => `${s.name} (${s.status}, ${s.startDate} → ${s.endDate}, ${s.done}/${s.tasks})`).join('; ') : 'nenhuma'}.`,
      '',
      `Candidatas (backlog e a fazer, ${candidates.length}):`,
      taskList(candidates),
      '',
      'Proponha: meta da sprint em uma frase, as tarefas escolhidas (até a capacidade) com o motivo, o que fica de fora e os riscos.',
      'Priorize urgentes/altas, prazos próximos e o que desbloqueia outras tarefas; não inclua tarefas bloqueadas por dependências abertas.',
      'Só depois de o usuário aprovar: crie a sprint com sprints_create (se não houver uma planejada) e associe as tarefas com sprints_assign_tasks.',
    ].join('\n');
    return promptMessages({ uri: `pf://projects/${project.key}`, data: project }, text);
  }

  @Prompt({
    name: 'relatorio-de-risco',
    title: 'Relatório de risco',
    description: 'Gera o relatório de risco de um projeto: atrasos, bloqueios e cadeias de dependência, prazo de entrega e recomendações.',
    argsSchema: ProjectArgs,
    scopes: [SCOPES.projectsRead, SCOPES.tasksRead],
  })
  @RequiresCap('project.view')
  riskReport(args: z.infer<typeof ProjectArgs>, ctx: McpContext) {
    const actor = this.actors.resolve(ctx);
    const project = this.projects.get(actor, args.projeto);
    const overdue = this.tasks.list(actor, { project: project.key, overdue: true, limit: 100 }).tasks;
    const blocked = this.tasks.list(actor, { project: project.key, blocked: true, limit: 100 }).tasks;
    const blockers = blocked.map((t) => {
      const detail = this.tasks.get(actor, t.ref);
      return `- ${t.ref} espera ${detail.blockedBy.map((b) => `${b.ref} (${b.status})`).join(', ') || '—'}`;
    });
    const text = [
      `Escreva o relatório de risco do projeto ${project.key} — ${project.name}.`,
      '',
      `Classificação atual do sistema: ${project.risk.label}. Progresso ${project.progress}%. Entrega prevista: ${project.targetDate ?? 'sem data'}.`,
      `Tarefas por status: ${Object.entries(project.taskCounts).map(([s, n]) => `${s} ${n}`).join(', ')}.`,
      `Marcos: ${project.milestones.map((m) => `${m.name} (${m.date}, ${m.status})`).join('; ') || 'nenhum'}.`,
      '',
      `Atrasadas (${overdue.length}):`,
      taskList(overdue),
      '',
      `Bloqueadas (${blocked.length}):`,
      blockers.join('\n') || '_nenhuma_',
      '',
      'Estruture em: resumo executivo (3 linhas), riscos priorizados (impacto × probabilidade), causas, ações recomendadas com responsável sugerido e o que observar na próxima semana.',
      'Não altere dados; se sugerir mudanças (repriorizar, reatribuir), liste-as para o usuário aprovar.',
    ].join('\n');
    return promptMessages({ uri: `pf://projects/${project.key}`, data: project }, text);
  }

  @Prompt({
    name: 'refinar-tarefa',
    title: 'Refinar tarefa',
    description: 'Refina uma tarefa: descrição clara, critérios de aceite verificáveis, subtarefas e riscos, a partir dos dados e comentários reais.',
    argsSchema: RefineArgs,
    scopes: [SCOPES.tasksRead],
  })
  @RequiresCap('task.view')
  refineTask(args: z.infer<typeof RefineArgs>, ctx: McpContext) {
    const actor = this.actors.resolve(ctx);
    const task = this.tasks.get(actor, args.ref);
    const text = [
      `Refine a tarefa ${task.ref} — "${task.title}" (${task.type}, ${task.status}, prioridade ${task.priority}, projeto ${task.project}).`,
      '',
      `Descrição atual: ${task.description || '(vazia)'}`,
      `Critérios de aceite atuais: ${task.acceptance.map((a) => `${a.done ? '[x]' : '[ ]'} ${a.text}`).join('; ') || '(nenhum)'}`,
      `Comentários (${task.comments.length}): ${task.comments.map((c) => `${c.author}: "${c.text}"`).join(' | ') || '—'}`,
      `Dependências: bloqueada por ${task.blockedBy.map((b) => b.ref).join(', ') || 'nada'}; bloqueia ${task.blocking.map((b) => b.ref).join(', ') || 'nada'}.`,
      '',
      'Proponha: (1) descrição objetiva com contexto e fora de escopo; (2) 3 a 6 critérios de aceite verificáveis; (3) subtarefas, se a tarefa for grande; (4) dúvidas para o time.',
      'Depois de o usuário aprovar, aplique com tasks_update (fields.description e fields.acceptance) e crie subtarefas com tasks_create (type "subtask", parent = este ref).',
    ].join('\n');
    return promptMessages({ uri: `pf://tasks/${task.ref}`, data: task }, text);
  }

  @Prompt({
    name: 'resumo-semanal',
    title: 'Resumo semanal da equipe',
    description: 'Resumo semanal de uma equipe: o que foi entregue nos últimos 7 dias, o que está em andamento e em revisão, atrasos e bloqueios.',
    argsSchema: WeeklyArgs,
    scopes: [SCOPES.projectsRead, SCOPES.tasksRead],
  })
  @RequiresCap('team.view')
  weeklySummary(args: z.infer<typeof WeeklyArgs>, ctx: McpContext) {
    const actor = this.actors.resolve(ctx);
    const digest = this.teams.digest(actor, args.equipe, 7);
    const text = [
      `Escreva o resumo semanal da equipe ${digest.team} (integrantes: ${digest.members.join(', ')}).`,
      '',
      `Concluídas nos últimos ${digest.periodDays} dias (${digest.doneRecently.length}):`,
      taskList(digest.doneRecently),
      '',
      `Em andamento (${digest.inProgress.length}):`,
      taskList(digest.inProgress),
      '',
      `Em revisão (${digest.inReview.length}):`,
      taskList(digest.inReview),
      '',
      `Atrasadas (${digest.overdue.length}):`,
      taskList(digest.overdue),
      '',
      `Bloqueadas (${digest.blocked.length}):`,
      taskList(digest.blocked),
      '',
      `Cumprimento de prazos da equipe: ${digest.onTimeRate == null ? 'sem amostra' : `${digest.onTimeRate}%`}.`,
      '',
      'Formato: destaques (3 bullets), entregas, em andamento, riscos e bloqueios com pedido de ajuda, foco da próxima semana. Tom objetivo, para o canal da equipe.',
    ].join('\n');
    return promptMessages({ uri: `pf://teams/${encodeURIComponent(digest.team)}/weekly`, data: digest }, text);
  }
}
