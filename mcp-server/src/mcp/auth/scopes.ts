/* Scopes OAuth do servidor. Eles limitam o que o TOKEN (o agente) pode fazer; a capacidade do
   papel e o escopo de organização/equipe do USUÁRIO são checados à parte, nos guards e services. */
export const SCOPES = {
  projectsRead: 'projects:read',
  projectsWrite: 'projects:write',
  tasksRead: 'tasks:read',
  tasksWrite: 'tasks:write',
  sprintsWrite: 'sprints:write',
  auditRead: 'audit:read',
  admin: 'admin',
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

export const ALL_SCOPES: Scope[] = Object.values(SCOPES);
