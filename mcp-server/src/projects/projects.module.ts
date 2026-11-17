import { Module } from '@nestjs/common';
import { ProjectsMcp } from './projects.mcp.js';
import { ProjectsService } from './projects.service.js';

@Module({
  providers: [ProjectsService, ProjectsMcp],
  exports: [ProjectsService],
})
export class ProjectsModule {}
