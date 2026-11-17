import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { can } from '../domain/access.js';
import type { Actor } from '../domain/actor.js';
import { ConflictError, ValidationError } from '../domain/errors.js';
import type { Db } from '../domain/model.js';
import { normalizeState } from '../domain/state-shape.js';
import type { BatchOptions } from '../sprints/sprints.service.js';
import { StateStore } from '../state/state.store.js';

function counts(db: Readonly<Db>) {
  return {
    orgs: db.orgs.length,
    users: db.users.length,
    teams: db.teams.length,
    projects: db.projects.length,
    tasks: db.tasks.length,
    sprints: db.sprints.length,
    audit: db.audit.length,
    events: db.events.length,
  };
}

/**
 * Exportar, importar e restaurar o estado (Configurações → Dados da demonstração). O JSON é o
 * mesmo do botão "Exportar estado (JSON)" do protótipo (localStorage `projectflow.db.v1`).
 * Tudo exige a capacidade user.manage (Administrador), como a restauração no protótipo.
 */
@Injectable()
export class StateAdminService {
  constructor(
    private readonly store: StateStore,
    private readonly audit: AuditService,
  ) {}

  async export(actor: Actor) {
    if (!can(actor.user, 'user.manage')) throw await this.audit.deny(actor, 'exportar o estado');
    return this.store.read((db) => ({ json: JSON.stringify(db, null, 2), counts: counts(db), location: this.store.location }));
  }

  async import(actor: Actor, content: string, options: BatchOptions = {}) {
    if (!can(actor.user, 'user.manage')) throw await this.audit.deny(actor, 'importar o estado');
    await options.onProgress?.(1, 4, 'Lendo o JSON');
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch (error) {
      throw new ValidationError(`O conteúdo não é um JSON válido: ${(error as Error).message}`);
    }
    await options.onProgress?.(2, 4, 'Validando formato e versão do seed');
    const result = normalizeState(raw, this.store.seedVersion);
    if (!result.ok) throw new ValidationError(`Estado recusado: ${result.reason}`);
    await options.onProgress?.(3, 4, 'Conferindo o usuário que importa');
    const db = result.db;
    if (!db.users.some((u) => u.id === actor.user.id)) {
      throw new ConflictError(`O estado importado não contém o usuário ${actor.user.name} (${actor.user.id}); a importação deixaria o agente sem identidade.`);
    }
    if (options.signal?.aborted) throw new ConflictError('Importação cancelada pelo cliente; nada foi alterado.');
    this.audit.record(db, actor, { action: 'import', entityType: 'state', entityId: null, projectId: null, after: counts(db), summary: 'importou o estado a partir de um JSON exportado' });
    await this.store.replace(db);
    await options.onProgress?.(4, 4, 'Estado gravado');
    return { imported: true, counts: counts(db), location: this.store.location };
  }

  async reset(actor: Actor, options: BatchOptions = {}) {
    if (!can(actor.user, 'user.manage')) throw await this.audit.deny(actor, 'restaurar os dados de demonstração');
    await options.onProgress?.(1, 2, 'Gerando o cenário inicial a partir do seed do protótipo');
    if (options.signal?.aborted) throw new ConflictError('Restauração cancelada pelo cliente; nada foi alterado.');
    const source = await this.store.reseed();
    await this.store.transaction((db) => {
      // quem restaurou fica registrado no estado novo (se o usuário existir no seed)
      if (db.users.some((u) => u.id === actor.user.id)) {
        this.audit.record(db, actor, { action: 'reset', entityType: 'state', entityId: null, projectId: null, summary: 'restaurou os dados de demonstração' });
      }
    });
    await options.onProgress?.(2, 2, 'Estado restaurado');
    return { reset: true, seedSource: source, counts: this.store.read(counts) };
  }
}
