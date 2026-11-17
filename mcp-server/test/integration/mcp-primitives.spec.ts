import type { Client } from '@modelcontextprotocol/client';
import { createTestApp, connect, type TestApp } from '../support/app.js';
import { json, text, TOKENS } from '../support/fixtures.js';

const PROTOTYPE_TOOLS = [
  'projects_list',
  'projects_get',
  'projects_create',
  'tasks_list',
  'tasks_get',
  'tasks_create',
  'tasks_update',
  'tasks_move',
  'tasks_assign',
  'sprints_list',
  'teams_list',
];

let t: TestApp;
let gestor: Client;

beforeAll(async () => {
  t = await createTestApp();
  gestor = await connect(t.app, TOKENS.gestor);
});

afterAll(async () => {
  await gestor?.close();
  await t?.close();
});

describe('catálogo de primitivas', () => {
  it('expõe as 11 ferramentas do protótipo com os mesmos nomes e as novas', async () => {
    const { tools } = await gestor.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(PROTOTYPE_TOOLS));
    expect(names).toEqual(
      expect.arrayContaining(['tasks_comment', 'tasks_link_dependency', 'sprints_close', 'projects_delete', 'insights_summary', 'audit_search', 'webhooks_redeliver', 'state_import']),
    );
    expect(tools).toHaveLength(30);
  });

  it('anotações e schemas: leitura com outputSchema, exclusão destrutiva, argumentos descritos', async () => {
    const { tools } = await gestor.listTools();
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
    expect(byName.tasks_list!.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true });
    expect(byName.tasks_list!.outputSchema).toBeDefined();
    expect(byName.projects_delete!.annotations).toMatchObject({ destructiveHint: true, readOnlyHint: false });
    const props = byName.tasks_move!.inputSchema.properties as Record<string, { description?: string }>;
    expect(props.status!.description).toMatch(/backlog, todo/);
  });

  it('lista 4 recursos, 4 templates e 4 prompts', async () => {
    const { resources } = await gestor.listResources();
    expect(resources.map((r) => r.uri).sort()).toEqual(['pf://catalog/events', 'pf://me', 'pf://projects', 'pf://roles']);
    const { resourceTemplates } = await gestor.listResourceTemplates();
    expect(resourceTemplates.map((r) => r.uriTemplate).sort()).toEqual(['pf://projects/{key}', 'pf://projects/{key}/board', 'pf://sprints/{id}', 'pf://tasks/{ref}']);
    const { prompts } = await gestor.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual(['planejar-sprint', 'refinar-tarefa', 'relatorio-de-risco', 'resumo-semanal']);
  });

  it('envia as instruções do servidor', () => {
    expect(gestor.getInstructions()).toMatch(/pf:\/\/me/);
  });
});

describe('ferramentas', () => {
  it('projects_list devolve structuredContent validado', async () => {
    const result = await gestor.callTool({ name: 'projects_list', arguments: {} });
    const data = json<{ count: number; projects: { key: string; progress: number }[] }>(result);
    expect(result.isError).toBeFalsy();
    expect(data.projects.map((p) => p.key)).toContain('PCL');
    expect(data.projects.every((p) => p.progress >= 0 && p.progress <= 100)).toBe(true);
  });

  it('tasks_create → tasks_move → tasks_get: escrita com auditoria de origem mcp', async () => {
    const created = json<{ ref: string }>(await gestor.callTool({ name: 'tasks_create', arguments: { project: 'PCL', title: 'Revisar textos do e-mail de fatura', priority: 'high' } }));
    expect(created.ref).toMatch(/^PCL-\d+$/);
    const moved = await gestor.callTool({ name: 'tasks_move', arguments: { ref: created.ref, status: 'done' } });
    expect(json<{ doneAt: string | null }>(moved).doneAt).toBeTruthy();
    const detail = json<{ status: string; history: { action: string; source: string }[] }>(await gestor.callTool({ name: 'tasks_get', arguments: { ref: created.ref } }));
    expect(detail.status).toBe('done');
    expect(detail.history.map((h) => h.action)).toEqual(['status', 'create']);
    expect(detail.history.every((h) => h.source === 'mcp')).toBe(true);
  });

  it('registra a execução no histórico mcpExecutions', async () => {
    await gestor.callTool({ name: 'teams_list', arguments: {} });
    const last = t.store.read((db) => db.mcpExecutions[0]);
    expect(last).toMatchObject({ tool: 'teams_list', ok: true });
  });

  it('input inválido não chega ao método', async () => {
    const result = await gestor.callTool({ name: 'tasks_move', arguments: { ref: 'PCL-101', status: 'doing' } });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/validation/i);
    expect(t.store.read((db) => db.tasks.find((x) => x.ref === 'PCL-101')!.status)).toBe('in_progress');
  });

  it('regra de domínio vira erro claro, sem stack', async () => {
    const result = await gestor.callTool({ name: 'sprints_start', arguments: { sprint: 'sp-pcl-16' } });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe('Conflito [conflict]: Já existe uma sprint ativa: encerre a Sprint 15 antes de iniciar a Sprint 16.');
  });

  it('dependência circular é recusada', async () => {
    const result = await gestor.callTool({ name: 'tasks_link_dependency', arguments: { ref: 'PCL-101', blockedBy: 'PCL-107' } });
    expect(text(result)).toMatch(/circular/);
  });

  it('insights_summary devolve os KPIs', async () => {
    const data = json<{ kpis: { activeProjects: number } }>(await gestor.callTool({ name: 'insights_summary', arguments: { periodDays: 30 } }));
    expect(data.kpis.activeProjects).toBeGreaterThan(0);
  });
});

describe('recursos e prompts', () => {
  it('pf://me descreve o chamador, capacidades e scopes', async () => {
    const { contents } = await gestor.readResource({ uri: 'pf://me' });
    const me = JSON.parse((contents[0] as { text: string }).text);
    expect(me).toMatchObject({ user: { id: 'u2', name: 'Ricardo Nogueira' }, role: { id: 'pm' }, org: 'Vetor Labs' });
    expect(me.capabilities).toContain('sprint.manage');
    expect(me.access.scopes).toContain('sprints:write');
  });

  it('pf://projects/{key}/board é markdown com colunas', async () => {
    const { contents } = await gestor.readResource({ uri: 'pf://projects/PCL/board' });
    const md = (contents[0] as { text: string; mimeType: string }).text;
    expect(contents[0]!.mimeType).toBe('text/markdown');
    expect(md).toMatch(/^# Quadro PCL/);
    expect(md).toContain('## Em andamento');
  });

  it('pf://tasks/{ref}, pf://sprints/{id}, pf://roles e pf://catalog/events', async () => {
    const task = JSON.parse(((await gestor.readResource({ uri: 'pf://tasks/PCL-107' })).contents[0] as { text: string }).text);
    expect(task.blockedBy[0].ref).toBe('PCL-101');
    const sprint = JSON.parse(((await gestor.readResource({ uri: 'pf://sprints/sp-pcl-15' })).contents[0] as { text: string }).text);
    expect(sprint).toMatchObject({ name: 'Sprint 15', status: 'active' });
    const roles = JSON.parse(((await gestor.readResource({ uri: 'pf://roles' })).contents[0] as { text: string }).text);
    expect(roles.roles).toHaveLength(5);
    const catalog = JSON.parse(((await gestor.readResource({ uri: 'pf://catalog/events' })).contents[0] as { text: string }).text);
    expect(catalog.events.map((e: { type: string }) => e.type)).toContain('task.status_changed.v1');
  });

  it('recurso fora do escopo responde resource-not-found', async () => {
    const error = await gestor.readResource({ uri: 'pf://tasks/CMA-101' }).catch((e: unknown) => e);
    // o SDK 2.x responde "recurso não encontrado" com -32602 (Invalid Params), não com -32002
    expect(error).toMatchObject({ code: -32602, message: expect.stringMatching(/não encontrada ou fora do seu escopo/) });
  });

  it('prompts trazem o contexto real embutido', async () => {
    const plan = await gestor.getPrompt({ name: 'planejar-sprint', arguments: { projeto: 'PCL', capacidade: '6' } });
    expect(plan.messages[0]!.content).toMatchObject({ type: 'resource', resource: { uri: 'pf://projects/PCL' } });
    expect((plan.messages[1]!.content as { text: string }).text).toContain('capacidade de 6 tarefas');
    const risk = await gestor.getPrompt({ name: 'relatorio-de-risco', arguments: { projeto: 'PCL' } });
    expect((risk.messages[1]!.content as { text: string }).text).toMatch(/PCL-107 espera PCL-101/);
    const refine = await gestor.getPrompt({ name: 'refinar-tarefa', arguments: { ref: 'PCL-103' } });
    expect((refine.messages[1]!.content as { text: string }).text).toContain('PCL-103');
    const weekly = await gestor.getPrompt({ name: 'resumo-semanal', arguments: { equipe: 'Plataforma' } });
    expect((weekly.messages[1]!.content as { text: string }).text).toContain('equipe Plataforma');
  });

  it('argumento de prompt inválido é recusado', async () => {
    await expect(gestor.getPrompt({ name: 'planejar-sprint', arguments: { projeto: 'PCL', capacidade: 'muitas' } })).rejects.toThrow();
  });
});
