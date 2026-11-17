import type { INestApplication } from '@nestjs/common';
import { McpHttpService } from '@nestjs/mcp';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { APP_CONFIG, loadConfig, type AppConfig } from '../../src/config/app-config.js';
import { configureHttp } from '../../src/http.setup.js';
import { StateStore } from '../../src/state/state.store.js';
import { tempState } from './fixtures.js';

export interface TestApp {
  app: NestExpressApplication;
  config: AppConfig;
  store: StateStore;
  close: () => Promise<void>;
}

/** A aplicação real (AppModule) com estado em arquivo temporário isolado. */
export async function createTestApp(env: Record<string, string> = {}): Promise<TestApp> {
  const tmp = tempState();
  const config = loadConfig({ PF_DATA_FILE: tmp.file, ...env });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_CONFIG)
    .useValue(config)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureHttp(app, config);
  await app.init();
  return {
    app,
    config,
    store: app.get(StateStore),
    close: async () => {
      await app.close();
      tmp.cleanup();
    },
  };
}

export function connect(app: INestApplication, token: string | undefined, era: 'modern' | 'legacy' = 'modern'): Promise<Client> {
  return connectMcpClient(app, { token, era });
}

/**
 * Cliente em memória que declara a capacidade de elicitação e responde às perguntas com
 * `answer` — o connectMcpClient do módulo não permite declarar capacidades do cliente.
 * Mesmo caminho do connectMcpClient: McpHttpService.fetch, sem socket.
 */
export async function connectEliciting(
  app: INestApplication,
  token: string,
  answer: { action: 'accept' | 'decline' | 'cancel'; content?: Record<string, string | number | boolean | string[]> },
  asked: string[] = [],
): Promise<Client> {
  const http = app.get(McpHttpService, { strict: false });
  const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
    fetch: (input, init) => {
      const request = new Request(input, init);
      if (!request.headers.has('host')) request.headers.set('host', 'localhost');
      const { pathname, search } = new URL(request.url);
      return http.fetch(request, { platformRequest: { method: request.method, url: pathname + search, headers: Object.fromEntries(request.headers) } });
    },
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  const client = new Client(
    { name: 'pf-test-eliciting', version: '1.0.0' },
    { capabilities: { elicitation: { form: {} } }, versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  client.setRequestHandler('elicitation/create', async (request) => {
    asked.push(request.params.message);
    return answer;
  });
  await client.connect(transport);
  return client;
}
