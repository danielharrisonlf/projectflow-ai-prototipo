import { Controller, Get } from '@nestjs/common';
import { McpRegistry } from '@nestjs/mcp';
import { SERVER_NAME, SERVER_VERSION } from '../mcp/mcp-options.factory.js';

/** Verificação de saúde para orquestradores (sem autenticação: não expõe dados do estado). */
@Controller('health')
export class HealthController {
  constructor(private readonly registry: McpRegistry) {}

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
    };
  }
}
