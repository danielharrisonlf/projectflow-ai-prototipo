import { Injectable, Logger } from '@nestjs/common';
import type { Actor } from '../domain/actor.js';
import { NOTIFICATION_MAP } from '../domain/constants.js';
import { uid } from '../domain/ids.js';
import type { Db, DeliveryAttempt, DomainEvent, Webhook } from '../domain/model.js';

/**
 * Eventos de domínio versionados (`task.status_changed.v1`…), entrega simulada aos webhooks
 * assinantes e notificações (PF.emitEvent / deliverWebhook / notify de core.js). Nenhuma
 * requisição HTTP sai do servidor: assinaturas com health "failing" (URL com fail/.local…)
 * registram 3 tentativas com 503.
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger('Events');

  emit(db: Db, actor: Actor, type: string, projectId: string | null, entityId: string | null, payload: Record<string, unknown> = {}): DomainEvent {
    const ev: DomainEvent = { id: uid('ev'), ts: new Date().toISOString(), type, projectId, entityId, actorId: actor.user.id, payload };
    db.events.unshift(ev);
    // o registro de auditoria da mesma entidade recebe o id do evento (correlação exata)
    const last = db.audit[0];
    if (last && !last.eventId && last.entityId && last.entityId === entityId) last.eventId = ev.id;
    for (const wh of db.webhooks) {
      if (wh.active && wh.events.includes(type)) this.deliver(db, wh, ev);
    }
    this.notify(db, ev);
    return ev;
  }

  deliver(db: Db, wh: Webhook, ev: DomainEvent): void {
    const fail = wh.health === 'failing';
    const now = Date.now();
    const attempts: DeliveryAttempt[] = fail
      ? [0, 1, 2].map((i) => ({
          ts: new Date(now + i * 1500).toISOString(),
          httpStatus: 503,
          ok: false,
          durationMs: 900 + Math.floor(Math.random() * 1800),
        }))
      : [{ ts: new Date(now).toISOString(), httpStatus: 200, ok: true, durationMs: 60 + Math.floor(Math.random() * 350) }];
    db.deliveries.unshift({
      id: uid('dl'),
      webhookId: wh.id,
      eventId: ev.id,
      eventType: ev.type,
      ts: new Date(now).toISOString(),
      status: fail ? 'failed' : 'success',
      httpStatus: fail ? 503 : 200,
      attempts,
      payload: { id: ev.id, type: ev.type, occurredAt: ev.ts, data: ev.payload },
    });
    if (fail) this.logger.warn(`Entrega simulada para "${wh.name}" falhou: 503 em 3 tentativas (${ev.type}).`);
  }

  private notify(db: Db, ev: DomainEvent): void {
    const map = NOTIFICATION_MAP[ev.type];
    if (!map) return;
    const toId = this.recipient(db, ev, map.to);
    if (!toId) return;
    const tpl = db.notifTemplates.find((t) => t.id === map.template);
    const toUser = db.users.find((u) => u.id === toId);
    if (!tpl || !toUser) return;
    const prefs = db.notifPrefs[tpl.event] ?? {};
    const vars = (ev.payload.vars ?? {}) as Record<string, string>;
    const fill = (s: string) => Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);
    for (const channel of ['email', 'whatsapp', 'sms']) {
      if (!prefs[channel]) continue;
      const configured = !!db.providers[channel]?.configured;
      db.notifications.unshift({
        id: uid('nf'),
        ts: new Date().toISOString(),
        channel,
        templateId: tpl.id,
        eventType: tpl.event,
        toUserId: toId,
        subject: fill(tpl.subject),
        body: fill(tpl.body),
        status: configured ? 'delivered' : 'failed',
        attempts: 1,
        failReason: configured ? null : `Provedor de ${channel.toUpperCase()} não configurado`,
      });
    }
  }

  private recipient(db: Db, ev: DomainEvent, to: 'assignee' | 'mentioned' | 'projectLead'): string | null {
    if (to === 'projectLead') return db.projects.find((p) => p.id === ev.projectId)?.leadId ?? null;
    const value = ev.payload[to];
    return typeof value === 'string' ? value : null;
  }
}
