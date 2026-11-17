/* Metadados de domínio portados de js/core.js (fonte única das regras do protótipo). */
import type { Priority, ProjectStatus, TaskStatus, TaskType } from './model.js';

export const SCHEMA_VERSION = 2;

export const TASK_STATUSES: readonly TaskStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];
export const PRIORITIES: readonly Priority[] = ['urgent', 'high', 'medium', 'low'];
export const TASK_TYPES: readonly TaskType[] = ['task', 'bug', 'subtask'];
export const PROJECT_STATUSES: readonly ProjectStatus[] = ['active', 'paused', 'done'];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'A fazer',
  in_progress: 'Em andamento',
  in_review: 'Em revisão',
  done: 'Concluído',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: 'Urgente',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

export const LABELS = [
  'backend',
  'frontend',
  'mobile',
  'infra',
  'dados',
  'ux',
  'seguranca',
  'performance',
  'documentacao',
  'cliente',
] as const;

export const SOURCE_LABELS: Record<string, string> = {
  ui: 'Interface',
  ai: 'IA',
  mcp: 'Agente MCP',
  automation: 'Automação',
  api: 'API',
};

/* ---------- permissões (ROLE_CAPS de core.js) ---------- */
export const ALL_CAPS = [
  'project.view',
  'project.create',
  'project.edit',
  'project.archive',
  'project.delete',
  'project.members',
  'task.view',
  'task.create',
  'task.edit',
  'task.move',
  'task.assign',
  'task.delete',
  'sprint.view',
  'sprint.manage',
  'team.view',
  'team.manage',
  'user.manage',
  'webhook.view',
  'webhook.manage',
  'notif.view',
  'notif.manage',
  'mcp.view',
  'mcp.read',
  'mcp.write',
  'audit.view',
  'insights.view',
  'ai.use',
  'ai.apply',
] as const;

export type Capability = (typeof ALL_CAPS)[number];

export const ROLE_CAPS: Record<string, readonly Capability[]> = {
  admin: ALL_CAPS,
  pm: [
    'project.view',
    'project.create',
    'project.edit',
    'project.archive',
    'project.members',
    'task.view',
    'task.create',
    'task.edit',
    'task.move',
    'task.assign',
    'task.delete',
    'sprint.view',
    'sprint.manage',
    'team.view',
    'webhook.view',
    'notif.view',
    'mcp.view',
    'mcp.read',
    'mcp.write',
    'audit.view',
    'insights.view',
    'ai.use',
    'ai.apply',
  ],
  lead: [
    'project.view',
    'task.view',
    'task.create',
    'task.edit',
    'task.move',
    'task.assign',
    'sprint.view',
    'team.view',
    'team.manage',
    'notif.view',
    'mcp.view',
    'mcp.read',
    'insights.view',
    'ai.use',
    'ai.apply',
  ],
  dev: [
    'project.view',
    'task.view',
    'task.create',
    'task.edit',
    'task.move',
    'sprint.view',
    'team.view',
    'notif.view',
    'mcp.view',
    'mcp.read',
    'ai.use',
  ],
  viewer: [
    'project.view',
    'task.view',
    'sprint.view',
    'team.view',
    'webhook.view',
    'notif.view',
    'mcp.view',
    'audit.view',
    'insights.view',
  ],
};

/* ---------- eventos de webhook (EVENT_CATALOG de views-intel.js) ---------- */
export const EVENT_CATALOG: ReadonlyArray<{ type: string; when: string }> = [
  { type: 'project.created.v1', when: 'um projeto é criado' },
  { type: 'project.updated.v1', when: 'um projeto é editado' },
  { type: 'project.archived.v1', when: 'um projeto é arquivado' },
  { type: 'project.unarchived.v1', when: 'um projeto arquivado é restaurado' },
  { type: 'task.created.v1', when: 'uma tarefa é criada' },
  { type: 'task.assigned.v1', when: 'uma tarefa muda de responsável' },
  { type: 'task.status_changed.v1', when: 'uma tarefa muda de status (Kanban ou painel de detalhes)' },
  { type: 'task.completed.v1', when: 'uma tarefa chega a Concluído' },
  { type: 'sprint.started.v1', when: 'uma sprint é iniciada' },
  { type: 'sprint.completed.v1', when: 'uma sprint é encerrada' },
];

/** Endpoints simulados com falha (mesma regra de core.js: FAILING_URL_RE). */
export const FAILING_URL_RE = /fail|erro|500|503|\.local\b/i;

/** Eventos que geram notificação, com o template e o destinatário (NOTIF_MAP de core.js). */
export const NOTIFICATION_MAP: Record<string, { template: string; to: 'assignee' | 'mentioned' | 'projectLead' }> = {
  'task.assigned.v1': { template: 'nt-assigned', to: 'assignee' },
  'comment.mention.v1': { template: 'nt-mention', to: 'mentioned' },
  'sprint.started.v1': { template: 'nt-sprint-start', to: 'projectLead' },
  'sprint.completed.v1': { template: 'nt-sprint-end', to: 'projectLead' },
  'task.blocked.v1': { template: 'nt-blocked', to: 'assignee' },
};
