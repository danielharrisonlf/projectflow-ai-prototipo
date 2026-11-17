import { Injectable } from '@nestjs/common';
import { Resource, type McpContext } from '@nestjs/mcp';
import { roleCaps, visibleProjects } from '../domain/access.js';
import { ALL_CAPS } from '../domain/constants.js';
import type { Db } from '../domain/model.js';
import { StateStore } from '../state/state.store.js';
import { ActorResolver } from './actor.resolver.js';

/** Recursos de identidade: quem é o chamador e a matriz de papéis × capacidades. */
@Injectable()
export class IdentityMcp {
  constructor(
    private readonly actors: ActorResolver,
    private readonly store: StateStore,
  ) {}

  @Resource({
    uri: 'pf://me',
    name: 'me',
    title: 'Meu perfil',
    description:
      'Quem o agente representa: usuário, papel, capacidades, organização, equipes, projetos visíveis e scopes do token. Leia antes de agir.',
    mimeType: 'application/json',
  })
  me(_input: unknown, ctx: McpContext) {
    const { user } = this.actors.resolve(ctx);
    return this.store.read((db) => ({
      user: { id: user.id, name: user.name, email: user.email, title: user.title ?? null },
      role: { id: user.roleId, name: db.roles.find((r) => r.id === user.roleId)?.name ?? user.roleId },
      org: db.orgs.find((o) => o.id === user.orgId)?.name ?? user.orgId,
      teams: user.teamIds.map((id) => db.teams.find((t) => t.id === id)?.name ?? id),
      capabilities: roleCaps(user.roleId),
      visibleProjects: visibleProjects(db as Db, user).map((p) => p.key),
      access: {
        transport: ctx.transport,
        era: ctx.era,
        scopes: ctx.authInfo ? ctx.authInfo.scopes : null,
        note: ctx.transport === 'stdio' ? 'stdio: identidade por PF_USER; scopes OAuth não se aplicam.' : 'HTTP: identidade e scopes do token Bearer.',
      },
      state: { location: this.store.location, seedVersion: db.meta.seedVersion },
    }));
  }

  @Resource({
    uri: 'pf://roles',
    name: 'roles',
    title: 'Papéis e capacidades',
    description: 'Matriz papel × capacidade (o que cada papel pode fazer), igual à tela Usuários e permissões → Papéis.',
    mimeType: 'application/json',
  })
  roles() {
    return this.store.read((db) => ({
      capabilities: ALL_CAPS,
      roles: db.roles.map((r) => ({ id: r.id, name: r.name, description: r.desc ?? '', capabilities: roleCaps(r.id) })),
    }));
  }
}
