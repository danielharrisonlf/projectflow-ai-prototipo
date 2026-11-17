import { Inject, Injectable } from '@nestjs/common';
import type { McpContext } from '@nestjs/mcp';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import type { Actor } from '../domain/actor.js';
import { UnauthenticatedError } from '../domain/errors.js';
import { matchUser } from '../domain/lookup.js';
import type { User } from '../domain/model.js';
import { StateStore } from '../state/state.store.js';

/**
 * Quem está chamando: em HTTP, o usuário do token verificado (`authInfo.extra.userId`);
 * em stdio, o usuário de PF_USER (id ou e-mail), já que o transporte não tem token.
 * A origem é sempre `mcp` (filtro "Agente MCP" da auditoria).
 */
@Injectable()
export class ActorResolver {
  constructor(
    private readonly store: StateStore,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  resolve(ctx: McpContext): Actor {
    return { user: this.user(ctx), source: 'mcp' };
  }

  private user(ctx: McpContext): User {
    const users = this.store.read((db) => db.users);
    let user: User | undefined;
    if (ctx.transport === 'stdio') {
      user = matchUser(users, this.config.stdioUser);
      if (!user) throw new UnauthenticatedError(`PF_USER="${this.config.stdioUser}" não corresponde a nenhum usuário do estado (use id, como u2, ou e-mail).`);
    } else {
      const userId = ctx.authInfo?.extra?.userId;
      if (typeof userId !== 'string') throw new UnauthenticatedError('Requisição sem token verificado: informe Authorization: Bearer <token>.');
      user = users.find((u) => u.id === userId);
      if (!user) throw new UnauthenticatedError(`O token aponta para o usuário ${userId}, que não existe no estado atual.`);
    }
    if (user.invited || user.active === false) throw new UnauthenticatedError(`O usuário ${user.name} está inativo ou com convite pendente.`);
    return user;
  }
}
