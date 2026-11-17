import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { McpModule } from '@nestjs/mcp';
import { AdminModule } from './admin/admin.module.js';
import { AuditModule } from './audit/audit.module.js';
import { APP_CONFIG, type AppConfig } from './config/app-config.js';
import { ConfigModule } from './config/config.module.js';
import { EventsModule } from './events/events.module.js';
import { HealthController } from './health/health.controller.js';
import { IdentityModule } from './identity/identity.module.js';
import { InsightsModule } from './insights/insights.module.js';
import { McpAuthModule } from './mcp/auth/mcp-auth.module.js';
import { StaticTokenVerifier } from './mcp/auth/static-token.verifier.js';
import { DomainErrorFilter } from './mcp/filters/domain-error.filter.js';
import { CapabilityGuard } from './mcp/guards/capability.guard.js';
import { McpCallLogInterceptor } from './mcp/interceptors/mcp-call-log.interceptor.js';
import { createMcpOptions } from './mcp/mcp-options.factory.js';
import { ProjectsModule } from './projects/projects.module.js';
import { PromptsModule } from './prompts/prompts.module.js';
import { SprintsModule } from './sprints/sprints.module.js';
import { StateModule } from './state/state.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { TeamsModule } from './teams/teams.module.js';

/**
 * Aplicação única para os dois transportes: HTTP (main.ts) e stdio (stdio.ts).
 * Guard, interceptor e filtro globais valem para todas as chamadas MCP.
 */
@Module({
  imports: [
    ConfigModule,
    StateModule,
    AuditModule,
    EventsModule,
    IdentityModule,
    ProjectsModule,
    TasksModule,
    SprintsModule,
    TeamsModule,
    InsightsModule,
    AdminModule,
    PromptsModule,
    McpModule.forRootAsync({
      imports: [McpAuthModule],
      inject: [APP_CONFIG, StaticTokenVerifier],
      useFactory: (config: AppConfig, verifier: StaticTokenVerifier) => createMcpOptions(config, verifier),
    }),
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: CapabilityGuard },
    { provide: APP_INTERCEPTOR, useClass: McpCallLogInterceptor },
    { provide: APP_FILTER, useClass: DomainErrorFilter },
  ],
})
export class AppModule {}
