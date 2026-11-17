import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { SprintsModule } from '../sprints/sprints.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { TeamsModule } from '../teams/teams.module.js';
import { PlanningPrompts } from './planning.prompts.js';

@Module({
  imports: [ProjectsModule, TasksModule, SprintsModule, TeamsModule],
  providers: [PlanningPrompts],
})
export class PromptsModule {}
