import { Test } from '@nestjs/testing';
import { StateAdminService } from '../../src/admin/state-admin.service.js';
import { AuditService } from '../../src/audit/audit.service.js';
import { APP_CONFIG, loadConfig } from '../../src/config/app-config.js';
import { EventsService } from '../../src/events/events.service.js';
import { WebhooksService } from '../../src/events/webhooks.service.js';
import { InsightsService } from '../../src/insights/insights.service.js';
import { ProjectsService } from '../../src/projects/projects.service.js';
import { SeedProvider } from '../../src/state/seed.provider.js';
import { StateRepository } from '../../src/state/state.repository.js';
import { StateStore } from '../../src/state/state.store.js';
import { SprintsService } from '../../src/sprints/sprints.service.js';
import { TasksService } from '../../src/tasks/tasks.service.js';
import { TeamsService } from '../../src/teams/teams.service.js';
import { actorOf } from './fixtures.js';
import { InMemoryStateRepository } from './in-memory-state.repository.js';

/** Services de domínio sobre o seed real do protótipo, com estado em memória. */
export async function createServices(initial?: unknown, env: Record<string, string> = {}) {
  const repository = new InMemoryStateRepository(initial);
  const moduleRef = await Test.createTestingModule({
    providers: [
      { provide: APP_CONFIG, useValue: loadConfig({ PF_TOKENS: '[]', ...env }) },
      { provide: StateRepository, useValue: repository },
      SeedProvider,
      StateStore,
      AuditService,
      EventsService,
      WebhooksService,
      ProjectsService,
      TasksService,
      SprintsService,
      TeamsService,
      InsightsService,
      StateAdminService,
    ],
  }).compile();
  await moduleRef.init();
  const store = moduleRef.get(StateStore);
  return {
    moduleRef,
    repository,
    store,
    projects: moduleRef.get(ProjectsService),
    tasks: moduleRef.get(TasksService),
    sprints: moduleRef.get(SprintsService),
    teams: moduleRef.get(TeamsService),
    insights: moduleRef.get(InsightsService),
    audit: moduleRef.get(AuditService),
    webhooks: moduleRef.get(WebhooksService),
    admin: moduleRef.get(StateAdminService),
    actor: (userId: string) => store.read((db) => actorOf(db, userId)),
    db: () => store.read((db) => db),
  };
}

export type Services = Awaited<ReturnType<typeof createServices>>;
