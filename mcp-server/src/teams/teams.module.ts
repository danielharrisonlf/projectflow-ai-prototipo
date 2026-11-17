import { Module } from '@nestjs/common';
import { TeamsMcp } from './teams.mcp.js';
import { TeamsService } from './teams.service.js';

@Module({
  providers: [TeamsService, TeamsMcp],
  exports: [TeamsService],
})
export class TeamsModule {}
