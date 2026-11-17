import { Injectable } from '@nestjs/common';
import { can, canSeeAudit, roleName, scopeUsers } from '../domain/access.js';
import type { Actor } from '../domain/actor.js';
import { NotFoundError, PermissionDeniedError } from '../domain/errors.js';
import { uid } from '../domain/ids.js';
import type { AuditEntry, Db } from '../domain/model.js';
import { findProject, matchUser } from '../domain/lookup.js';
import { StateStore } from '../state/state.store.js';

export interface AuditRecord {
  action: string;
  entityType: string;
  entityId: string | null;
  projectId: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  summary: string;
}

export interface AuditSearchFilters {
  user?: string;
  project?: string;
  action?: string;
  source?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
  text?: string;
  limit?: number;
}

/** Auditoria de mutações e negações (audit()/PF.deny de core.js). */
@Injectable()
export class AuditService {
  constructor(private readonly store: StateStore) {}

  /** Registra uma mutação dentro da transação corrente. */
  record(db: Db, actor: Actor, rec: AuditRecord): AuditEntry {
    const entry: AuditEntry = {
      id: uid('au'),
      ts: new Date().toISOString(),
      userId: actor.user.id,
      action: rec.action,
      entityType: rec.entityType,
      entityId: rec.entityId,
      projectId: rec.projectId,
      before: rec.before ?? null,
      after: rec.after ?? null,
      summary: rec.summary,
      source: actor.source,
    };
    db.audit.unshift(entry);
    return entry;
  }

  /**
   * A negação a lançar: mensagem para o agente e o registro `denied` que o StateStore grava
   * mesmo com a transação desfeita.
   */
  denial(db: Readonly<Db>, actor: Actor, what: string): PermissionDeniedError {
    return new PermissionDeniedError(
      `Sem permissão: o perfil “${roleName(db as Db, actor.user.roleId)}” não pode ${what}.`,
      this.deniedEntry(actor, what),
    );
  }

  /**
   * Tentativa sobre algo que existe mas está fora do escopo do usuário: para o agente, a
   * resposta é "não encontrado" (sem vazar que existe, como PF.mcpExecute); na auditoria, `denied`.
   */
  outOfScope(actor: Actor, what: string, message: string): NotFoundError {
    return new NotFoundError(message, this.deniedEntry(actor, `${what} (fora do escopo)`));
  }

  private deniedEntry(actor: Actor, what: string): AuditEntry {
    return {
      id: uid('au'),
      ts: new Date().toISOString(),
      userId: actor.user.id,
      action: 'denied',
      entityType: 'permission',
      entityId: null,
      projectId: null,
      before: null,
      after: null,
      summary: `tentativa sem permissão: ${what}`,
      source: actor.source,
    };
  }

  /** Registra a negação fora de uma transação (guards) e devolve o erro a lançar. */
  async deny(actor: Actor, what: string): Promise<PermissionDeniedError> {
    try {
      await this.store.transaction((db) => {
        throw this.denial(db, actor, what);
      });
    } catch (error) {
      if (error instanceof PermissionDeniedError) return error;
      throw error;
    }
    throw new Error('inalcançável');
  }

  async search(actor: Actor, filters: AuditSearchFilters) {
    if (!can(actor.user, 'audit.view')) throw await this.deny(actor, 'consultar a auditoria');
    return this.store.read((db) => {
      // filtros resolvidos dentro do escopo: inexistente e fora do escopo respondem igual
      const user = filters.user ? matchUser(scopeUsers(db as Db, actor.user), filters.user) : undefined;
      if (filters.user && !user) throw new NotFoundError(`Usuário "${filters.user}" não encontrado no seu escopo.`);
      const project = filters.project ? findProject(db as Db, actor.user, filters.project, { includeArchived: true }) : undefined;
      if (filters.project && !project) throw new NotFoundError(`Projeto "${filters.project}" não encontrado ou fora do seu escopo de acesso.`);
      const text = filters.text?.toLowerCase();
      const limit = Math.min(filters.limit ?? 50, 200);
      const matches = db.audit.filter(
        (a) =>
          canSeeAudit(db, actor.user, a) &&
          (!user || a.userId === user.id) &&
          (!project || a.projectId === project.id) &&
          (!filters.action || a.action === filters.action) &&
          (!filters.source || a.source === filters.source) &&
          (!filters.entityType || a.entityType === filters.entityType) &&
          (!filters.entityId || a.entityId === filters.entityId) &&
          (!filters.from || a.ts >= filters.from) &&
          (!filters.to || (filters.to.length === 10 ? a.ts.slice(0, 10) : a.ts) <= filters.to) &&
          (!text || a.summary.toLowerCase().includes(text)),
      );
      return {
        total: matches.length,
        entries: matches.slice(0, limit).map((a) => ({
          id: a.id,
          ts: a.ts,
          user: db.users.find((u) => u.id === a.userId)?.name ?? a.userId,
          action: a.action,
          entityType: a.entityType,
          entityId: a.entityId,
          project: a.projectId ? (db.projects.find((p) => p.id === a.projectId)?.key ?? null) : null,
          summary: a.summary,
          source: a.source,
          before: a.before,
          after: a.after,
          eventId: a.eventId ?? null,
        })),
      };
    });
  }
}
