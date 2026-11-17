import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { McpStdioLogger, McpStdioServer } from '@nestjs/mcp';
import { AppModule } from './app.module.js';

/**
 * stdio, para hosts que iniciam o servidor como processo local (Claude Code, Claude Desktop):
 * `node dist/stdio.js`. O usuário vem de PF_USER (id ou e-mail; padrão u2, o gestor).
 * stdout é o canal do protocolo: todo log vai para o stderr (McpStdioLogger).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: new McpStdioLogger() });
  // SIGINT/SIGTERM também passam pelo encerramento (grava o histórico pendente)
  app.enableShutdownHooks();
  await app.get(McpStdioServer).listen();
  await app.close();
}

void bootstrap();
