import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { tempState, text } from '../support/fixtures.js';

/** stdio de verdade: o cliente SDK inicia `node dist/stdio.js` (compilado no globalSetup). */
const main = fileURLToPath(new URL('../../dist/stdio.js', import.meta.url));

function spawnClient(era: 'modern' | 'legacy', env: Record<string, string>) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [main],
    // NO_COLOR: o ConsoleLogger do Nest deixa de intercalar códigos ANSI no stderr
    env: { ...(process.env as Record<string, string>), NO_COLOR: '1', ...env },
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', (chunk) => (stderr += String(chunk)));
  const client = new Client(
    { name: 'e2e-stdio', version: '1.0.0' },
    { capabilities: { elicitation: { form: {} } }, ...(era === 'modern' && { versionNegotiation: { mode: { pin: '2026-07-28' } } }) },
  );
  client.setRequestHandler('elicitation/create', async () => ({ action: 'accept', content: { confirm: true } }));
  return { client, transport, stderr: () => stderr };
}

describe.each(['modern', 'legacy'] as const)('stdio, cliente %s', (era) => {
  const tmp = tempState();
  let gestor: ReturnType<typeof spawnClient>;

  beforeAll(async () => {
    gestor = spawnClient(era, { PF_USER: 'ricardo.nogueira@vetorlabs.dev', PF_DATA_FILE: tmp.file });
    await gestor.client.connect(gestor.transport);
  });

  afterAll(async () => {
    await gestor?.client.close();
    tmp.cleanup();
  });

  it('negocia a era e lista as primitivas', async () => {
    expect(gestor.client.getProtocolEra()).toBe(era);
    expect((await gestor.client.listTools()).tools).toHaveLength(30);
    expect((await gestor.client.listPrompts()).prompts).toHaveLength(4);
  });

  it('identidade vem de PF_USER e os scopes não se aplicam', async () => {
    const { contents } = await gestor.client.readResource({ uri: 'pf://me' });
    const me = JSON.parse((contents[0] as { text: string }).text);
    expect(me).toMatchObject({ user: { id: 'u2' }, access: { transport: 'stdio', scopes: null } });
  });

  it('escreve no arquivo de estado com auditoria de origem mcp', async () => {
    const result = await gestor.client.callTool({ name: 'tasks_move', arguments: { ref: 'PCL-103', status: 'in_progress' } });
    expect(result.isError).toBeFalsy();
    await vi.waitFor(() => {
      const saved = JSON.parse(readFileSync(tmp.file, 'utf8'));
      expect(saved.audit[0]).toMatchObject({ action: 'status', source: 'mcp', userId: 'u2' });
    });
  });

  it('logs no stderr, fora do canal do protocolo', async () => {
    await vi.waitFor(() => expect(gestor.stderr()).toContain('[McpCalls] tool tasks_move'));
  });

  it('o guard de capacidade roda também em stdio: gestor não exclui projetos', async () => {
    const result = await gestor.client.callTool({ name: 'projects_delete', arguments: { project: 'WEB', confirm: true } });
    expect(text(result)).toMatch(/não pode excluir projetos/);
  });
});

it('admin em stdio exclui com confirmação (modern: elicitação; legacy: confirm)', async () => {
  for (const era of ['modern', 'legacy'] as const) {
    const tmp = tempState();
    const admin = spawnClient(era, { PF_USER: 'u1', PF_DATA_FILE: tmp.file });
    await admin.client.connect(admin.transport);
    try {
      if (era === 'legacy') {
        const refused = await admin.client.callTool({ name: 'projects_delete', arguments: { project: 'WEB' } });
        expect(text(refused)).toMatch(/confirm: true/);
      }
      const args = era === 'legacy' ? { project: 'WEB', confirm: true } : { project: 'WEB' };
      const result = await admin.client.callTool({ name: 'projects_delete', arguments: args });
      expect(JSON.parse(text(result))).toMatchObject({ key: 'WEB' });
    } finally {
      await admin.client.close();
      tmp.cleanup();
    }
  }
});

it('PF_USER desconhecido: chamadas falham com mensagem clara', async () => {
  const tmp = tempState();
  const ghost = spawnClient('modern', { PF_USER: 'ninguem@exemplo.dev', PF_DATA_FILE: tmp.file });
  await ghost.client.connect(ghost.transport);
  try {
    const result = await ghost.client.callTool({ name: 'projects_list', arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/PF_USER="ninguem@exemplo.dev" não corresponde/);
  } finally {
    await ghost.client.close();
    tmp.cleanup();
  }
});
