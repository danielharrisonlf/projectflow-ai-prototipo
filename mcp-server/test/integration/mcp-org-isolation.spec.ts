import type { Client } from '@modelcontextprotocol/client';
import { connect, createTestApp, type TestApp } from '../support/app.js';
import { json, text, TOKENS } from '../support/fixtures.js';

/** Nada da Atlas Engenharia pode aparecer para perfis da Vetor Labs, em nenhuma primitiva. */
let t: TestApp;
const clients: Client[] = [];
let needles: string[];

beforeAll(async () => {
  t = await createTestApp();
  const admin = await connect(t.app, TOKENS.admin);
  clients.push(admin);
  // atividade da Atlas: auditoria, eventos, entregas de webhook e notificações
  await admin.callTool({ name: 'tasks_comment', arguments: { ref: 'CMA-101', text: 'Comentário confidencial da Atlas @Ricardo Nogueira' } });
  await admin.callTool({ name: 'tasks_move', arguments: { ref: 'CMA-101', status: 'in_review' } });
  await admin.callTool({ name: 'tasks_create', arguments: { project: 'ERP', title: 'Tarefa secreta da Atlas' } });
  await admin.callTool({ name: 'sprints_create', arguments: { project: 'CMA', name: 'Sprint Atlas', startDate: '2026-12-01', endDate: '2026-12-14' } });
  needles = t.store.read((db) => {
    const atlas = new Set(db.projects.filter((p) => p.orgId === 'org-atlas').map((p) => p.id));
    return ['Atlas', 'Renata', 'Thiago', 'Consultoria', 'CMA-', 'ERP-', 'Andrade', 'Protheus', ...db.tasks.filter((x) => atlas.has(x.projectId)).map((x) => x.title)];
  });
});

afterAll(async () => {
  await Promise.all(clients.map((c) => c.close()));
  await t.close();
});

const leaks = (value: unknown) => needles.filter((n) => JSON.stringify(value).includes(n));

describe.each([
  ['gestor', TOKENS.gestor],
  ['dev', TOKENS.dev],
  ['auditor', TOKENS.auditor],
])('perfil %s da Vetor', (_who, token) => {
  let client: Client;
  beforeAll(async () => {
    client = await connect(t.app, token);
    clients.push(client);
  });

  it('ferramentas de leitura não devolvem dados da Atlas', async () => {
    const tools = new Set((await client.listTools()).tools.map((x) => x.name));
    const calls: [string, Record<string, unknown>][] = [
      ['projects_list', {}],
      ['projects_list', { status: 'archived' }],
      ['tasks_list', { limit: 100, includeSubtasks: true }],
      ['sprints_list', {}],
      ['teams_list', {}],
      ['insights_summary', {}],
      ['audit_search', { limit: 200 }],
      ['audit_search', { text: 'CMA' }],
      ['webhooks_list', {}],
      ['webhooks_deliveries', { limit: 100 }],
    ];
    for (const [name, args] of calls) {
      if (!tools.has(name)) continue;
      const result = await client.callTool({ name, arguments: args }).catch((e: unknown) => e);
      expect({ name, leaks: leaks(result) }).toEqual({ name, leaks: [] });
    }
  });

  it('recursos e templates da Atlas respondem como inexistentes', async () => {
    for (const uri of ['pf://me', 'pf://projects', 'pf://roles', 'pf://catalog/events']) {
      expect({ uri, leaks: leaks(await client.readResource({ uri })) }).toEqual({ uri, leaks: [] });
    }
    const sprintId = t.store.read((db) => db.sprints.find((s) => s.name === 'Sprint Atlas')!.id);
    for (const uri of ['pf://projects/CMA', 'pf://projects/CMA/board', 'pf://tasks/CMA-101', `pf://sprints/${sprintId}`]) {
      const error = await client.readResource({ uri }).then(
        () => 'leu',
        (e: Error) => e.message,
      );
      expect(error).toMatch(/não encontrad[ao] ou fora do seu escopo/);
    }
  });

  it('prompts sobre a Atlas não montam contexto', async () => {
    for (const [name, args] of [
      ['planejar-sprint', { projeto: 'CMA', capacidade: '5' }],
      ['relatorio-de-risco', { projeto: 'ERP' }],
      ['refinar-tarefa', { ref: 'CMA-101' }],
      ['resumo-semanal', { equipe: 'Consultoria' }],
      ['resumo-semanal', { equipe: 'tm-consult' }],
    ] as const) {
      const outcome = await client.getPrompt({ name, arguments: args }).then(
        (r) => leaks(r),
        // a mensagem de erro repete o argumento informado (ex.: "CMA-101"): isso não é vazamento
        (e: Error) => leaks(Object.values(args).reduce((msg, v) => msg.split(v).join('<arg>'), e.message)),
      );
      expect({ name, outcome }).toEqual({ name, outcome: [] });
    }
  });

  it('pf://me não expõe o caminho do arquivo de estado', async () => {
    const me = JSON.parse(((await client.readResource({ uri: 'pf://me' })).contents[0] as { text: string }).text);
    expect(me.state).toEqual({ seedVersion: expect.any(Number) });
    expect(JSON.stringify(me)).not.toContain(t.config.dataFile.replace(/\\/g, '\\\\'));
  });
});

it('anotações: reenvio de webhook não é idempotente; arquivar é', async () => {
  const client = await connect(t.app, TOKENS.admin);
  clients.push(client);
  const tools = Object.fromEntries((await client.listTools()).tools.map((x) => [x.name, x.annotations]));
  expect(tools.webhooks_redeliver).toMatchObject({ idempotentHint: false, readOnlyHint: false });
  expect(tools.projects_archive).toMatchObject({ idempotentHint: true });
  const first = json<{ changed: boolean }>(await client.callTool({ name: 'projects_archive', arguments: { project: 'WEB' } }));
  const second = await client.callTool({ name: 'projects_archive', arguments: { project: 'WEB' } });
  expect(first.changed).toBe(true);
  expect(second.isError).toBeFalsy();
  expect(json<{ changed: boolean }>(second).changed).toBe(false);
  expect(text(await client.callTool({ name: 'projects_unarchive', arguments: { project: 'WEB' } }))).toContain('"changed":true');
});

it('estado importado sem campos opcionais continua legível pelas ferramentas', async () => {
  const admin = await connect(t.app, TOKENS.admin);
  clients.push(admin);
  const exported = await admin.callTool({ name: 'state_export', arguments: {} });
  const db = JSON.parse((exported.content as { resource?: { text: string } }[])[1]!.resource!.text);
  delete db.projects[0].createdAt;
  delete db.projects[0].desc;
  delete db.users.find((u: { id: string }) => u.id === 'u12').email;
  delete db.tasks[0].createdAt;
  db.tasks[0].acceptance = [{ text: 'ok' }, null, 'lixo'];
  const imported = await admin.callTool({ name: 'state_import', arguments: { content: JSON.stringify(db), confirm: true } });
  expect(imported.isError).toBeFalsy();
  const project = await admin.callTool({ name: 'projects_get', arguments: { project: db.projects[0].key } });
  expect(project.isError).toBeFalsy();
  expect((await admin.callTool({ name: 'projects_list', arguments: {} })).isError).toBeFalsy();
  const task = await admin.callTool({ name: 'tasks_get', arguments: { ref: db.tasks[0].ref } });
  expect(task.isError).toBeFalsy();
  expect(json<{ acceptance: unknown[] }>(task).acceptance).toEqual([{ text: 'ok', done: false }]);
  const assigned = await admin.callTool({ name: 'tasks_assign', arguments: { ref: 'PCL-109', assignee: 'Ricardo Nogueira' } });
  expect(assigned.isError).toBeFalsy();
  expect((await admin.callTool({ name: 'tasks_list', arguments: { assignee: 'Ricardo Nogueira' } })).isError).toBeFalsy();
});
