/* Modelo do estado do ProjectFlow: o mesmo formato que o protótipo guarda no localStorage
   (`projectflow.db.v1`) e exporta em Configurações → "Exportar estado (JSON)". */

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done';
export type Priority = 'urgent' | 'high' | 'medium' | 'low';
export type TaskType = 'task' | 'bug' | 'subtask';
export type ProjectStatus = 'active' | 'paused' | 'done';
export type SprintStatus = 'planned' | 'active' | 'done';
export type RoleId = 'admin' | 'pm' | 'lead' | 'dev' | 'viewer';
export type AuditSource = 'ui' | 'ai' | 'mcp' | 'automation' | 'api';

export interface Org {
  id: string;
  name: string;
  slug: string;
  desc?: string;
  demo?: boolean;
}

export interface Role {
  id: string;
  name: string;
  desc?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  initials?: string;
  color?: string;
  title?: string;
  roleId: string;
  orgId: string;
  teamIds: string[];
  active?: boolean;
  invited?: boolean;
  favoriteProjectIds?: string[];
}

export interface Team {
  id: string;
  orgId: string;
  name: string;
  desc?: string;
  leadId: string | null;
  memberIds: string[];
}

export interface Project {
  id: string;
  orgId: string;
  key: string;
  name: string;
  desc: string;
  teamIds: string[];
  leadId: string | null;
  priority: Priority;
  status: ProjectStatus;
  startDate: string | null;
  targetDate: string | null;
  archived: boolean;
  createdAt: string;
  color?: string;
  favorite?: boolean;
  progressNote?: string;
  age?: number;
}

export interface Epic {
  id: string;
  projectId: string;
  name: string;
  desc?: string;
  status: string;
  ownerId?: string | null;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string;
  status: SprintStatus;
  startDate: string;
  endDate: string;
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  date: string;
  status: string;
}

export interface AcceptanceCriterion {
  text: string;
  done: boolean;
}

export interface Task {
  id: string;
  ref: string;
  projectId: string;
  epicId: string | null;
  parentId: string | null;
  type: TaskType;
  title: string;
  desc: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string | null;
  teamId: string | null;
  sprintId: string | null;
  labels: string[];
  acceptance: AcceptanceCriterion[];
  blockedBy: string[];
  createdAt: string;
  updatedAt: string;
  doneAt: string | null;
  dueDate: string | null;
  createdBy: string | null;
}

export interface Comment {
  id: string;
  taskId: string;
  userId: string;
  text: string;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  ts: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  projectId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  summary: string;
  source: AuditSource | string;
  eventId?: string;
}

export interface DomainEvent {
  id: string;
  ts: string;
  type: string;
  projectId: string | null;
  entityId: string | null;
  actorId: string;
  payload: Record<string, unknown>;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  health: 'ok' | 'failing' | string;
  createdAt: string;
}

export interface DeliveryAttempt {
  ts: string;
  httpStatus: number;
  ok: boolean;
  durationMs: number;
  manual?: boolean;
}

export interface Delivery {
  id: string;
  webhookId: string;
  eventId: string;
  eventType: string;
  ts: string;
  status: 'success' | 'failed';
  httpStatus: number;
  attempts: DeliveryAttempt[];
  payload: { id: string; type: string; occurredAt: string; data: Record<string, unknown> };
}

export interface Notification {
  id: string;
  ts: string;
  channel: string;
  templateId: string;
  eventType: string;
  toUserId: string;
  subject: string;
  body: string;
  status: 'delivered' | 'failed' | string;
  attempts: number;
  failReason?: string | null;
}

export interface NotificationTemplate {
  id: string;
  event: string;
  name: string;
  subject: string;
  body: string;
}

export interface Provider {
  name: string;
  configured: boolean;
  from?: string;
  host?: string;
}

export interface McpExecution {
  id: string;
  ts: string;
  agentId: string | null;
  tool: string;
  args: unknown;
  ok: boolean;
  summary: string;
}

export interface Db {
  meta: { seedVersion: number; seededAt?: string; schema?: number; [key: string]: unknown };
  settings: { currentUserId?: string; currentProjectId?: string | null; [key: string]: unknown };
  orgs: Org[];
  roles: Role[];
  users: User[];
  teams: Team[];
  projects: Project[];
  epics: Epic[];
  sprints: Sprint[];
  milestones: Milestone[];
  tasks: Task[];
  comments: Comment[];
  audit: AuditEntry[];
  events: DomainEvent[];
  webhooks: Webhook[];
  deliveries: Delivery[];
  notifications: Notification[];
  notifTemplates: NotificationTemplate[];
  notifPrefs: Record<string, Record<string, boolean>>;
  providers: Record<string, Provider>;
  mcpTools: unknown[];
  mcpAgents: unknown[];
  mcpExecutions: McpExecution[];
  taskCounters: Record<string, number>;
}
