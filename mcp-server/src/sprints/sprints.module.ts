import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module.js';
import { SprintsMcp } from './sprints.mcp.js';
import { SprintsService } from './sprints.service.js';

@Module({
  imports: [TasksModule],
  providers: [SprintsService, SprintsMcp],
  exports: [SprintsService],
})
export class SprintsModule {}
