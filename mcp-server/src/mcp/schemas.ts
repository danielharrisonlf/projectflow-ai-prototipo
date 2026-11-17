/* Schemas Zod compartilhados pelas primitivas MCP: argumentos (com .describe() para o modelo),
   saídas estruturadas das ferramentas de leitura e anotações de comportamento. */
import type { ToolAnnotations } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { LABELS, PRIORITIES, PROJECT_STATUSES, TASK_STATUSES, TASK_TYPES } from '../domain/constants.js';

/* ---------- argumentos ---------- */
export const projectRef = z.string().trim().min(1).max(40).describe('Projeto: chave (ex.: PCL) ou id (ex.: prj-pcl).');
export const taskRef = z.string().trim().min(1).max(40).describe('Tarefa: ref (ex.: PCL-124) ou id interno.');
export const taskStatus = z.enum(TASK_STATUSES as [string, ...string[]]).describe('Status: backlog, todo, in_progress, in_review ou done.');
export const priority = z.enum(PRIORITIES as [string, ...string[]]).describe('Prioridade: urgent, high, medium ou low.');
export const taskType = z.enum(TASK_TYPES as [string, ...string[]]).describe('Tipo: task, bug ou subtask (subtask exige parent).');
export const projectStatus = z.enum(PROJECT_STATUSES as [string, ...string[]]).describe('Situação do projeto: active, paused ou done.');
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use o formato AAAA-MM-DD');
export const label = z.enum(LABELS);
export const person = z.string().trim().min(1).max(120);
export const sprintRef = z.string().trim().min(1).max(60).describe('Sprint: id (ex.: sp-pcl-15) ou nome (ex.: "Sprint 15"; com nome, informe também project).');

/* ---------- anotações ---------- */
export const READ_ONLY: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
export const WRITE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
export const WRITE_IDEMPOTENT: ToolAnnotations = { ...WRITE, idempotentHint: true };
export const DESTRUCTIVE: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

/* ---------- saídas ---------- */
const riskLevel = z.enum(['ok', 'mid', 'high']);

export const ProjectSummaryOut = z.object({
  key: z.string(),
  name: z.string(),
  status: z.string(),
  priority: z.string(),
  progress: z.number().describe('% de tarefas (sem subtarefas) concluídas'),
  targetDate: z.string().nullable(),
  archived: z.boolean(),
  org: z.string(),
  lead: z.string().nullable(),
  teams: z.array(z.string()),
});

export const ProjectListOut = z.object({ count: z.number(), projects: z.array(ProjectSummaryOut) });

export const ProjectDetailOut = ProjectSummaryOut.extend({
  id: z.string(),
  description: z.string(),
  startDate: z.string().nullable(),
  createdAt: z.string().nullable(),
  risk: z.object({ level: riskLevel, label: z.string(), overdueTasks: z.number(), blockedTasks: z.number() }),
  taskCounts: z.record(z.string(), z.number()),
  epics: z.array(z.object({ name: z.string(), status: z.string() })),
  milestones: z.array(z.object({ name: z.string(), date: z.string(), status: z.string() })),
  sprints: z.array(z.object({ id: z.string(), name: z.string(), status: z.string(), startDate: z.string(), endDate: z.string() })),
});

export const TaskSummaryOut = z.object({
  ref: z.string(),
  title: z.string(),
  type: z.string(),
  status: z.string(),
  priority: z.string(),
  assignee: z.string().nullable(),
  project: z.string(),
  sprint: z.string().nullable(),
  dueDate: z.string().nullable(),
  overdue: z.boolean(),
  blocked: z.boolean(),
});

export const TaskListOut = z.object({ total: z.number(), count: z.number(), tasks: z.array(TaskSummaryOut) });

const taskLink = z.object({ ref: z.string(), title: z.string(), status: z.string() });

export const TaskDetailOut = TaskSummaryOut.extend({
  id: z.string(),
  description: z.string(),
  labels: z.array(z.string()),
  acceptance: z.array(z.object({ text: z.string(), done: z.boolean() })),
  epic: z.string().nullable(),
  parent: taskLink.nullable(),
  team: z.string().nullable(),
  subtasks: z.array(taskLink),
  blockedBy: z.array(taskLink),
  blocking: z.array(taskLink),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  doneAt: z.string().nullable(),
  createdBy: z.string().nullable(),
  comments: z.array(z.object({ author: z.string(), text: z.string(), createdAt: z.string() })),
  history: z.array(z.object({ ts: z.string(), user: z.string(), action: z.string(), summary: z.string(), source: z.string() })),
});

export const SprintSummaryOut = z.object({
  id: z.string(),
  name: z.string(),
  project: z.string(),
  status: z.string(),
  goal: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  tasks: z.number(),
  done: z.number(),
  progress: z.number(),
});

export const SprintListOut = z.object({ count: z.number(), sprints: z.array(SprintSummaryOut) });

export const TeamListOut = z.object({
  count: z.number(),
  teams: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      org: z.string(),
      lead: z.string().nullable(),
      members: z.array(z.object({ name: z.string(), role: z.string().nullable(), title: z.string().nullable() })),
      projects: z.array(z.string()),
    }),
  ),
});

export const InsightsOut = z.object({
  filters: z.object({ project: z.string().nullable(), team: z.string().nullable(), periodDays: z.number() }),
  kpis: z.object({
    activeProjects: z.number(),
    projectsInScope: z.number(),
    doneProjects: z.number(),
    projectsAtRisk: z.number(),
    tasksDoneInPeriod: z.number(),
    overdueTasks: z.number(),
    onTimeRate: z.number().nullable().describe('% de tarefas concluídas com prazo que terminaram no prazo'),
  }),
  tasksByStatus: z.array(z.object({ status: z.string(), label: z.string(), count: z.number() })),
  projectSituation: z.object({ healthy: z.number(), attention: z.number(), atRisk: z.number(), delivered: z.number() }),
  weeklyCompletions: z.array(z.object({ weekEnding: z.string(), done: z.number() })),
  teams: z.array(z.object({ team: z.string(), open: z.number(), done: z.number(), overdue: z.number(), onTimeRate: z.number().nullable() })),
  projects: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      status: z.string(),
      progress: z.number(),
      risk: z.string(),
      overdue: z.number(),
      blocked: z.number(),
      targetDate: z.string().nullable(),
    }),
  ),
});

const json = z.record(z.string(), z.unknown()).nullable();

export const AuditSearchOut = z.object({
  total: z.number(),
  entries: z.array(
    z.object({
      id: z.string(),
      ts: z.string(),
      user: z.string(),
      action: z.string(),
      entityType: z.string(),
      entityId: z.string().nullable(),
      project: z.string().nullable(),
      summary: z.string(),
      source: z.string(),
      before: json,
      after: json,
      eventId: z.string().nullable(),
    }),
  ),
});
