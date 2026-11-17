import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { can, canSeeProject } from '../domain/access.js';
import type { Actor } from '../domain/actor.js';
import { EVENT_CATALOG } from '../domain/constants.js';
import { ConflictError, NotFoundError } from '../domain/errors.js';
import type { Db, Delivery, DomainEvent } from '../domain/model.js';
import { StateStore } from '../state/state.store.js';

export interface DeliveryFilters {
  webhook?: string;
  status?: 'success' | 'failed';
  eventType?: string;
  limit?: number;
}

/** Evento visível: de projeto no escopo do usuário; eventos sem projeto (ping), só para o admin. */
function eventVisible(db: Db, actor: Actor, ev: DomainEvent): boolean {
  if (actor.user.roleId === 'admin') return true;
  return ev.projectId != null && canSeeProject(db, actor.user, ev.projectId, { includeArchived: true });
}

function maskSecret(secret: string): string {
  return secret.length > 10 ? `${secret.slice(0, 10)}…` : '…';
}

@Injectable()
export class WebhooksService {
  constructor(
    private readonly store: StateStore,
    private readonly audit: AuditService,
  ) {}

  /** Catálogo de eventos de webhook com o número de ocorrências visíveis para o usuário. */
  catalog(actor: Actor) {
    return this.store.read((db) => {
      const visible = db.events.filter((ev) => eventVisible(db as Db, actor, ev));
      return EVENT_CATALOG.map((e) => ({ ...e, occurrences: visible.filter((ev) => ev.type === e.type).length }));
    });
  }

  /**
   * Assinaturas de webhook. No protótipo elas não pertencem a uma organização; por isso a URL
   * (que revela a integração) e o segredo mascarado só aparecem para quem gerencia webhooks
   * (webhook.manage, o Administrador). Os contadores consideram só entregas de eventos visíveis.
   */
  async list(actor: Actor) {
    if (!can(actor.user, 'webhook.view')) throw await this.audit.deny(actor, 'ver webhooks');
    const manager = can(actor.user, 'webhook.manage');
    return this.store.read((db) => {
      const visible = this.visibleDeliveries(db as Db, actor);
      return db.webhooks.map((wh) => {
        const mine = visible.filter((d) => d.webhookId === wh.id);
        return {
          id: wh.id,
          name: wh.name,
          url: manager ? wh.url : null,
          secret: manager ? maskSecret(wh.secret) : null,
          events: wh.events,
          active: wh.active,
          health: wh.health,
          createdAt: wh.createdAt,
          deliveries: mine.length,
          failedDeliveries: mine.filter((d) => d.status === 'failed').length,
        };
      });
    });
  }

  async deliveries(actor: Actor, filters: DeliveryFilters) {
    if (!can(actor.user, 'webhook.view')) throw await this.audit.deny(actor, 'ver o histórico de envios de webhooks');
    return this.store.read((db) => {
      const wh = filters.webhook ? db.webhooks.find((w) => w.id === filters.webhook || w.name.toLowerCase() === filters.webhook!.toLowerCase()) : undefined;
      if (filters.webhook && !wh) throw new NotFoundError(`Webhook "${filters.webhook}" não encontrado.`);
      const list = this.visibleDeliveries(db as Db, actor).filter(
        (d) => (!wh || d.webhookId === wh.id) && (!filters.status || d.status === filters.status) && (!filters.eventType || d.eventType === filters.eventType),
      );
      return {
        total: list.length,
        deliveries: list.slice(0, Math.min(filters.limit ?? 20, 100)).map((d) => this.present(d, db.webhooks.find((w) => w.id === d.webhookId)?.name ?? null)),
      };
    });
  }

  /** Reenvio manual: simula o endpoint recuperado (200 OK), como no protótipo. */
  async redeliver(actor: Actor, deliveryId: string) {
    if (!can(actor.user, 'webhook.manage')) throw await this.audit.deny(actor, 'reenviar entregas');
    return this.store.transaction((db) => {
      const dl = db.deliveries.find((d) => d.id === deliveryId);
      if (!dl) throw new NotFoundError(`Entrega ${deliveryId} não encontrada.`);
      const wh = db.webhooks.find((w) => w.id === dl.webhookId);
      if (!wh) throw new ConflictError('A assinatura desta entrega foi excluída; não há destino para reenviar.');
      dl.attempts.push({ ts: new Date().toISOString(), httpStatus: 200, ok: true, durationMs: 120 + Math.floor(Math.random() * 200), manual: true });
      dl.status = 'success';
      dl.httpStatus = 200;
      this.audit.record(db, actor, {
        action: 'redeliver',
        entityType: 'webhook',
        entityId: wh.id,
        projectId: null,
        summary: `reenviou manualmente o evento ${dl.eventType} para ${wh.name}`,
      });
      return this.present(dl, wh.name);
    });
  }

  /** Entregas de eventos que o usuário pode ver (projetos do seu escopo de organização). */
  private visibleDeliveries(db: Db, actor: Actor): Delivery[] {
    const events = new Map(db.events.map((ev) => [ev.id, ev]));
    return db.deliveries.filter((d) => {
      const ev = events.get(d.eventId);
      return ev ? eventVisible(db, actor, ev) : actor.user.roleId === 'admin';
    });
  }

  private present(d: Delivery, webhookName: string | null) {
    return {
      id: d.id,
      webhook: webhookName,
      eventId: d.eventId,
      eventType: d.eventType,
      ts: d.ts,
      status: d.status,
      httpStatus: d.httpStatus,
      attempts: d.attempts,
    };
  }
}
