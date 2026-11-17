import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AppConfig } from './config/app-config.js';

/** Ajustes do Express para o endpoint MCP (usados por main.ts e pelos testes e2e). */
export function configureHttp(app: NestExpressApplication, config: AppConfig): void {
  // o padrão do Express é 100 KB; importar o estado envia o JSON inteiro
  app.useBodyParser('json', { limit: '4mb' });
  app.enableCors({
    origin: config.corsOrigins,
    allowedHeaders: ['Authorization', 'Content-Type', 'Mcp-Protocol-Version', 'Mcp-Method', 'Mcp-Name', 'Last-Event-ID'],
    exposedHeaders: ['WWW-Authenticate'],
  });
}
