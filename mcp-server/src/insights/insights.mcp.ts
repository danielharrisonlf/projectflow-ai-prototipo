import { Injectable } from '@nestjs/common';
import { Tool, type McpContext } from '@nestjs/mcp';
import * as z from 'zod';
import { ActorResolver } from '../identity/actor.resolver.js';
import { SCOPES } from '../mcp/auth/scopes.js';
import { RequiresCap } from '../mcp/guards/requires-cap.decorator.js';
import { InsightsOut, projectRef, READ_ONLY } from '../mcp/schemas.js';
import { InsightsService } from './insights.service.js';

const SummaryInput = z.object({
  project: projectRef.optional().describe('Restringe a um projeto (chave).'),
  team: z.string().max(80).optional().describe('Restringe a uma equipe (nome ou id).'),
  periodDays: z.number().int().min(7).max(365).optional().describe('Janela, em dias, de "tarefas concluídas no período" (padrão 90).'),
});

@Injectable()
export class InsightsMcp {
  constructor(
    private readonly insights: InsightsService,
    private readonly actors: ActorResolver,
  ) {}

  @Tool({
    name: 'insights_summary',
    title: 'Indicadores (Insights)',
    description:
      'KPIs da Visão executiva: projetos ativos, concluídos e em risco, tarefas concluídas no período, atrasadas, % de cumprimento de prazos, distribuição por status, situação dos projetos, série semanal de conclusões e resumo por equipe.',
    inputSchema: SummaryInput,
    outputSchema: InsightsOut,
    annotations: READ_ONLY,
    scopes: [SCOPES.projectsRead],
  })
  @RequiresCap('insights.view')
  summary(input: z.infer<typeof SummaryInput>, ctx: McpContext) {
    return this.insights.summary(this.actors.resolve(ctx), input);
  }
}
