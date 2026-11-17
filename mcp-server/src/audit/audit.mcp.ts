import { Injectable } from '@nestjs/common';
import { Tool, type McpContext } from '@nestjs/mcp';
import * as z from 'zod';
import { ActorResolver } from '../identity/actor.resolver.js';
import { SCOPES } from '../mcp/auth/scopes.js';
import { RequiresCap } from '../mcp/guards/requires-cap.decorator.js';
import { AuditSearchOut, projectRef, READ_ONLY } from '../mcp/schemas.js';
import { AuditService } from './audit.service.js';

const SearchInput = z.object({
  user: z.string().max(120).optional().describe('Quem fez (nome completo, e-mail ou id).'),
  project: projectRef.optional(),
  action: z
    .string()
    .max(40)
    .optional()
    .describe('Ação: create, update, status, assign, priority, comment, block, unblock, archive, unarchive, delete, sprint_start, sprint_end, redeliver, import, reset ou denied.'),
  source: z.enum(['ui', 'ai', 'mcp', 'automation', 'api']).optional().describe('Origem: ui (Interface), ai (IA), mcp (Agente MCP), automation ou api.'),
  entityType: z.enum(['project', 'task', 'sprint', 'epic', 'webhook', 'permission', 'state', 'team', 'user', 'notification']).optional(),
  entityId: z.string().max(60).optional().describe('Id interno da entidade (ex.: tsk12).'),
  from: z.string().max(30).optional().describe('A partir de (AAAA-MM-DD ou ISO 8601).'),
  to: z.string().max(30).optional().describe('Até (AAAA-MM-DD, inclusivo, ou ISO 8601).'),
  text: z.string().max(120).optional().describe('Trecho do resumo (ex.: "PCL-104").'),
  limit: z.number().int().min(1).max(200).optional().describe('Máximo de registros (padrão 50).'),
});

@Injectable()
export class AuditMcp {
  constructor(
    private readonly audit: AuditService,
    private readonly actors: ActorResolver,
  ) {}

  @Tool({
    name: 'audit_search',
    title: 'Consultar auditoria',
    description:
      'Busca na auditoria (mais recentes primeiro) por usuário, projeto, ação, origem, entidade, período e texto, com os valores anteriores e novos de cada mudança. Admin vê todas as organizações; os demais, só a própria.',
    inputSchema: SearchInput,
    outputSchema: AuditSearchOut,
    annotations: READ_ONLY,
    scopes: [SCOPES.auditRead],
  })
  @RequiresCap('audit.view')
  search(input: z.infer<typeof SearchInput>, ctx: McpContext) {
    return this.audit.search(this.actors.resolve(ctx), input);
  }
}
