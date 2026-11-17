import { Injectable, Logger, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { McpExecutionContext, type McpContextType } from '@nestjs/mcp';
import { AuditService } from '../../audit/audit.service.js';
import { can } from '../../domain/access.js';
import { ActorResolver } from '../../identity/actor.resolver.js';
import { REQUIRES_CAP, type RequiredCap } from './requires-cap.decorator.js';

/**
 * Autorização de negócio das chamadas MCP: o papel do usuário precisa da capacidade declarada
 * com @RequiresCap. Roda em HTTP e em stdio (onde os scopes OAuth não são checados).
 * O escopo por organização/equipe de cada projeto ou tarefa é checado nos services.
 */
@Injectable()
export class CapabilityGuard implements CanActivate {
  private readonly logger = new Logger('CapabilityGuard');

  constructor(
    private readonly reflector: Reflector,
    private readonly actors: ActorResolver,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType<McpContextType>() !== 'mcp') return true;
    const required = this.reflector.getAllAndOverride<RequiredCap | undefined>(REQUIRES_CAP, [context.getHandler(), context.getClass()]);
    if (!required) return true;
    const mcp = McpExecutionContext.create(context);
    const actor = this.actors.resolve(mcp.getContext());
    if (can(actor.user, required.cap)) return true;
    this.logger.warn(`${mcp.getKind()} ${mcp.getName()}: ${actor.user.name} (${actor.user.roleId}) sem ${required.cap}`);
    throw await this.audit.deny(actor, required.what);
  }
}
