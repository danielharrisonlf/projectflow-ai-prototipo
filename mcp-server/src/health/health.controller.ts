import { Controller, Get } from '@nestjs/common';
import { McpRegistry } from '@nestjs/mcp';
import { SERVER_NAME, SERVER_VERSION } from '../mcp/mcp-options.factory.js';
import { StateStore } from '../state/state.store.js';

/** Verificação de saúde para orquestradores e para conferir a subida (sem autenticação). */
@Controller('health')
export class HealthController {
  constructor(
    private readonly registry: McpRegistry,
    private readonly store: StateStore,
  ) {}

  @Get()
  check() {
    return {
      status: 'ok',
      server: { name: SERVER_NAME, version: SERVER_VERSION },
      primitives: {
        tools: this.registry.tools.length,
        resources: this.registry.resources.length,
        resourceTemplates: this.registry.resourceTemplates.length,
        prompts: this.registry.prompts.length,
      },
      state: this.store.read((db) => ({ projects: db.projects.length, tasks: db.tasks.length, seedVersion: db.meta.seedVersion })),
    };
  }
}
