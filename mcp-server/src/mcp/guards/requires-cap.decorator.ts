import { SetMetadata } from '@nestjs/common';
import type { Capability } from '../../domain/constants.js';

export const REQUIRES_CAP = 'projectflow:requires-cap';

export interface RequiredCap {
  cap: Capability;
  /** O que a negação diz que o perfil não pode fazer ("criar tarefas"). */
  what: string;
}

/** Como a negação descreve cada capacidade (mesmos textos de PF.guard no protótipo). */
export const CAP_ACTIONS: Partial<Record<Capability, string>> = {
  'project.view': 'ver projetos',
  'project.create': 'criar projetos',
  'project.edit': 'editar projetos',
  'project.archive': 'arquivar projetos',
  'project.delete': 'excluir projetos',
  'task.view': 'ver tarefas',
  'task.create': 'criar tarefas',
  'task.edit': 'editar tarefas',
  'task.move': 'mover tarefas',
  'task.assign': 'atribuir tarefas',
  'sprint.view': 'ver sprints',
  'sprint.manage': 'gerenciar sprints',
  'team.view': 'ver equipes',
  'user.manage': 'administrar os dados da organização',
  'webhook.view': 'ver webhooks',
  'webhook.manage': 'gerenciar webhooks',
  'audit.view': 'consultar a auditoria',
  'insights.view': 'ver indicadores do Insights',
};

/**
 * Capacidade de papel exigida pela primitiva MCP (autorização de negócio, além do scope OAuth).
 * O CapabilityGuard nega com erro claro e registra `denied` na auditoria.
 */
export const RequiresCap = (cap: Capability, what?: string) =>
  SetMetadata(REQUIRES_CAP, { cap, what: what ?? CAP_ACTIONS[cap] ?? cap } satisfies RequiredCap);
