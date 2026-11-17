import { Injectable } from '@nestjs/common';
import { Tool, type McpContext } from '@nestjs/mcp';
import { ActorResolver } from '../identity/actor.resolver.js';
import { SCOPES } from '../mcp/auth/scopes.js';
import { RequiresCap } from '../mcp/guards/requires-cap.decorator.js';
import { READ_ONLY, TeamListOut } from '../mcp/schemas.js';
import { TeamsService } from './teams.service.js';

@Injectable()
export class TeamsMcp {
  constructor(
    private readonly teams: TeamsService,
    private readonly actors: ActorResolver,
  ) {}

  @Tool({
    name: 'teams_list',
    title: 'Listar equipes',
    description: 'Lista as equipes da organização com líder, integrantes (papel e cargo) e os projetos visíveis de cada uma. Útil para escolher responsáveis.',
    outputSchema: TeamListOut,
    annotations: READ_ONLY,
    scopes: [SCOPES.projectsRead],
  })
  @RequiresCap('team.view')
  list(_input: unknown, ctx: McpContext) {
    return this.teams.list(this.actors.resolve(ctx));
  }
}
