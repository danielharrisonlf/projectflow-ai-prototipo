import { Injectable } from '@nestjs/common';
import { Resource, Tool, type McpContext } from '@nestjs/mcp';
import * as z from 'zod';
import { ActorResolver } from '../identity/actor.resolver.js';
import { SCOPES } from '../mcp/auth/scopes.js';
import { RequiresCap } from '../mcp/guards/requires-cap.decorator.js';
import { READ_ONLY, WRITE } from '../mcp/schemas.js';
import { WebhooksService } from './webhooks.service.js';

const DeliveriesInput = z.object({
  webhook: z.string().max(80).optional().describe('Assinatura (id, ex.: wh2, ou nome).'),
  status: z.enum(['success', 'failed']).optional().describe('Só entregas com sucesso ou com falha.'),
  eventType: z.string().max(60).optional().describe('Tipo de evento (ex.: task.status_changed.v1).'),
  limit: z.number().int().min(1).max(100).optional().describe('Máximo de entregas (padrão 20).'),
});
const RedeliverInput = z.object({ deliveryId: z.string().min(1).max(40).describe('Id da entrega (ex.: dl3), obtido em webhooks_deliveries.') });

@Injectable()
export class WebhooksMcp {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly actors: ActorResolver,
  ) {}

  @Tool({
    name: 'webhooks_list',
    title: 'Listar webhooks',
    description:
      'Lista as assinaturas de webhook (eventos, ativa, saúde e falhas nas entregas que você pode ver). URL e segredo (mascarado) só para quem gerencia webhooks.',
    annotations: READ_ONLY,
    scopes: [SCOPES.auditRead],
  })
  @RequiresCap('webhook.view')
  list(_input: unknown, ctx: McpContext) {
    return this.webhooks.list(this.actors.resolve(ctx));
  }

  @Tool({
    name: 'webhooks_deliveries',
    title: 'Histórico de envios',
    description:
      'Histórico de entregas de webhook com as tentativas (status HTTP e duração). Entregas são simuladas: URLs com fail/.local respondem 503 em 3 tentativas.',
    inputSchema: DeliveriesInput,
    annotations: READ_ONLY,
    scopes: [SCOPES.auditRead],
  })
  @RequiresCap('webhook.view', 'ver o histórico de envios de webhooks')
  deliveries(input: z.infer<typeof DeliveriesInput>, ctx: McpContext) {
    return this.webhooks.deliveries(this.actors.resolve(ctx), input);
  }

  @Tool({
    name: 'webhooks_redeliver',
    title: 'Reenviar entrega',
    description: 'Reenvia manualmente uma entrega (simula o endpoint recuperado: 200 OK). Só Administrador (webhook.manage).',
    inputSchema: RedeliverInput,
    annotations: WRITE,
    scopes: [SCOPES.admin],
  })
  @RequiresCap('webhook.manage', 'reenviar entregas')
  redeliver(input: z.infer<typeof RedeliverInput>, ctx: McpContext) {
    return this.webhooks.redeliver(this.actors.resolve(ctx), input.deliveryId);
  }

  @Resource({
    uri: 'pf://catalog/events',
    name: 'event-catalog',
    title: 'Catálogo de eventos',
    description: 'Eventos de domínio versionados que os webhooks podem assinar, quando cada um dispara e quantas ocorrências há no seu escopo. Payload: {id, type, occurredAt, data}.',
    mimeType: 'application/json',
  })
  catalog(_input: unknown, ctx: McpContext) {
    return { payload: '{ id, type, occurredAt, data }', events: this.webhooks.catalog(this.actors.resolve(ctx)) };
  }
}
