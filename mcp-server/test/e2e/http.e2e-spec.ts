import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createTestApp, type TestApp } from '../support/app.js';
import { json, TOKENS } from '../support/fixtures.js';

/** HTTP de verdade: app.listen(0) em loopback e fetch/cliente SDK sobre o socket. */
let t: TestApp;
let url: URL;

const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
const toolsList = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

function challenge(response: Response): Record<string, string> {
  const header = response.headers.get('www-authenticate') ?? '';
  return Object.fromEntries([...header.matchAll(/(\w+)="((?:[^"\\]|\\.)*)"/g)].map(([, k, v]) => [k, v]));
}

beforeAll(async () => {
  t = await createTestApp();
  await t.app.listen(0, '127.0.0.1');
  url = new URL('/mcp', await t.app.getUrl());
});

afterAll(async () => {
  await t?.close();
});

it('GET /health responde com as primitivas registradas', async () => {
  const response = await fetch(new URL('/health', url));
  expect(response.status).toBe(200);
  const body = await response.json();
  // sem autenticação: só situação, versão e primitivas — nenhum dado do estado
  expect(body).toEqual({ status: 'ok', server: { name: 'projectflow', version: '1.0.0' }, primitives: { tools: 30, resources: 4, resourceTemplates: 4, prompts: 4 } });
});

it('Host fora da lista recebe 403 (anti DNS rebinding)', async () => {
  const { request } = await import('node:http');
  const status = (host: string) =>
    new Promise<number | undefined>((resolve, reject) => {
      const req = request(url, { method: 'POST', headers: { ...headers, host, authorization: `Bearer ${TOKENS.gestor}` } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end(toolsList);
    });
  expect(await status('evil.example')).toBe(403);
  expect(await status(`localhost:${url.port}`)).toBe(200);
});

it('sem token: 401 com WWW-Authenticate apontando o resource_metadata', async () => {
  const response = await fetch(url, { method: 'POST', headers, body: toolsList });
  expect(response.status).toBe(401);
  expect(challenge(response)).toEqual({
    error: 'invalid_token',
    error_description: 'Missing Authorization header',
    resource_metadata: 'http://localhost:3333/.well-known/oauth-protected-resource/mcp',
  });
});

it('serve o protected resource metadata (RFC 9728)', async () => {
  const response = await fetch(new URL('/.well-known/oauth-protected-resource/mcp', url));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    resource: 'http://localhost:3333/mcp',
    authorization_servers: ['https://auth.projectflow.example'],
    scopes_supported: expect.arrayContaining(['tasks:write', 'admin']),
    resource_name: 'ProjectFlow AI',
  });
});

it('Origin estrangeiro recebe 403 (proteção contra páginas de outros sites)', async () => {
  const response = await fetch(url, { method: 'POST', headers: { ...headers, origin: 'https://evil.example', authorization: `Bearer ${TOKENS.gestor}` }, body: toolsList });
  expect(response.status).toBe(403);
  const local = await fetch(url, { method: 'POST', headers: { ...headers, origin: 'http://localhost:6274', authorization: `Bearer ${TOKENS.gestor}` }, body: toolsList });
  expect(local.status).toBe(200);
});

it('scope insuficiente: 403 insufficient_scope com o scope pedido', async () => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...headers, authorization: `Bearer ${TOKENS.gestorLeitura}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'tasks_create', arguments: { project: 'PCL', title: 'x' } } }),
  });
  expect(response.status).toBe(403);
  expect(challenge(response)).toMatchObject({ error: 'insufficient_scope', scope: 'tasks:write' });
});

it.each(['modern', 'legacy'] as const)('cliente SDK %s: initialize/tools/list e uma chamada real', async (era) => {
  const client = new Client({ name: 'e2e', version: '1.0.0' }, era === 'modern' ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {});
  await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { authorization: `Bearer ${TOKENS.dev}` } } }));
  try {
    expect(client.getProtocolEra()).toBe(era);
    expect((await client.listTools()).tools).toHaveLength(30);
    const projects = json<{ projects: { key: string }[] }>(await client.callTool({ name: 'projects_list', arguments: {} }));
    expect(projects.projects.map((p) => p.key).sort()).toEqual(['ONB', 'PCL', 'WEB']);
  } finally {
    await client.close();
  }
});

it('JSON grande cabe no limite de 4 MB (state_import)', async () => {
  const client = new Client({ name: 'e2e', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { authorization: `Bearer ${TOKENS.admin}` } } }));
  try {
    const exported = await client.callTool({ name: 'state_export', arguments: {} });
    const content = (exported.content as { resource?: { text: string } }[])[1]!.resource!.text;
    expect(content.length).toBeGreaterThan(100_000); // acima do limite padrão de 100 KB do Express
    const result = await client.callTool({ name: 'state_import', arguments: { content, confirm: true } });
    expect(result.isError).toBeFalsy();
  } finally {
    await client.close();
  }
});
