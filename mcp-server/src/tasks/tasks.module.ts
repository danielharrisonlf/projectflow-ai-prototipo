import { Module } from '@nestjs/common';
import { TasksMcp } from './tasks.mcp.js';
import { TasksService } from './tasks.service.js';

@Module({
  providers: [TasksService, TasksMcp],
  exports: [TasksService],
})
export class TasksModule {}
