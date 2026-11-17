import type { McpModuleOptions } from '@nestjs/mcp';
import type { AppConfig } from '../config/app-config.js';
import { ALL_SCOPES } from './auth/scopes.js';
import type { StaticTokenVerifier } from './auth/static-token.verifier.js';
import { SERVER_INSTRUCTIONS } from './instructions.js';

export const SERVER_NAME = 'projectflow';
export const SERVER_VERSION = '1.0.0';

/** Opções do McpModule: identidade do servidor, regras do endpoint HTTP e OAuth (resource server). */
export function createMcpOptions(config: AppConfig, verifier: StaticTokenVerifier): McpModuleOptions {
  return {
    name: SERVER_NAME,
    version: SERVER_VERSION,
    title: 'ProjectFlow AI',
    description: 'Projetos, sprints, tarefas, auditoria e indicadores do ProjectFlow AI, com as regras de permissão do produto.',
    instructions: SERVER_INSTRUCTIONS,
    http: {
      ...(config.allowedHosts && { allowedHosts: config.allowedHosts }),
      ...(config.allowedOrigins !== undefined && { allowedOrigins: config.allowedOrigins }),
      maxRequestBodySize: 4 * 1024 * 1024,
    },
    auth: {
      verifier,
      resource: config.resource,
      authorizationServers: [config.authIssuer],
      scopesSupported: ALL_SCOPES,
      resourceName: 'ProjectFlow AI',
    },
  };
}
