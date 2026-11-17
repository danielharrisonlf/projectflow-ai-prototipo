import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { APP_CONFIG, type AppConfig } from './config/app-config.js';
import { configureHttp } from './http.setup.js';

/** Streamable HTTP em http://localhost:3333/mcp (OAuth: Authorization: Bearer <token>). */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<AppConfig>(APP_CONFIG);
  configureHttp(app, config);
  app.enableShutdownHooks();
  await app.listen(config.port, config.host);
  const logger = new Logger('Bootstrap');
  logger.log(`MCP em ${await app.getUrl()}/mcp (resource ${config.resource}) · saúde em /health`);
}

void bootstrap();
