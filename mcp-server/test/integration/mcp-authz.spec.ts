import { InsufficientScopeError, SdkHttpError, type Client } from '@modelcontextprotocol/client';
import { connect, connectEliciting, createTestApp, type TestApp } from '../support/app.js';
import { json, text, TOKENS } from '../support/fixtures.js';

let t: TestApp;
const clients: Client[] = [];

async function as(token: string, era: 'modern' | 'legacy' = 'modern') {
  const client = await connect(t.app, token, era);
  clients.push(client);
  return client;
}

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await t.close();
});

const lastAudit = () => t.store.read((db) => db.audit[0]!);

describe('autenticação OAuth (resource server)', () => {
  it('sem token a conexão é recusada (401)', async () => {
    const error = await connect(t.app, undefined).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SdkHttpError);
  });

  it('token desconhecido é recusado', async () => {
    const error = await connect(t.app, 'pf-token-que-nao-existe-123').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SdkHttpError);
  });

  it('scope insuficiente vira InsufficientScopeError (step-up) antes do método', async () => {
    const leitura = await as(TOKENS.gestorLeitura);
    const error = await leitura.callTool({ name: 'tasks_create', arguments: { project: 'PCL', title: 'x' } }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InsufficientScopeError);
    expect(error).toMatchObject({ requiredScope: 'tasks:write' });
    // a leitura com o mesmo token funciona
    expect((await leitura.callTool({ name: 'tasks_list', arguments: { project: 'PCL' } })).isError).toBeFalsy();
  });

  it('cada ferramenta pede o seu scope: audit:read para a auditoria', async () => {
    const auditor = await as(TOKENS.auditor);
    expect((await auditor.callTool({ name: 'audit_search', arguments: { limit: 1 } })).isError).toBeFalsy();
    const dev = await as(TOKENS.dev);
    await expect(dev.callTool({ name: 'audit_search', arguments: {} })).rejects.toBeInstanceOf(InsufficientScopeError);
  });
});

describe('scopes em recursos e prompts', () => {
  it('token só com tasks:read não lê pf://projects nem pede o prompt de planejamento', async () => {
    await t.close();
    t = await createTestApp({ PF_TOKENS: JSON.stringify([{ token: 'pf-test-so-tarefas-leitura', profile: 'restrito', userId: 'u2', scopes: ['tasks:read'] }]) });
    const restrito = await as('pf-test-so-tarefas-leitura');
    await expect(restrito.readResource({ uri: 'pf://projects' })).rejects.toBeInstanceOf(InsufficientScopeError);
    await expect(restrito.getPrompt({ name: 'planejar-sprint', arguments: { projeto: 'PCL', capacidade: '5' } })).rejects.toBeInstanceOf(InsufficientScopeError);
    // recurso sem scope (pf://me) e template com tasks:read continuam acessíveis
    expect((await restrito.readResource({ uri: 'pf://me' })).contents).toHaveLength(1);
    expect((await restrito.readResource({ uri: 'pf://tasks/PCL-101' })).contents).toHaveLength(1);
  });
});

describe('progresso em lote (sprints_assign_tasks)', () => {
  it('reporta progresso por tarefa e o resultado de cada uma', async () => {
    const gestor = await as(TOKENS.gestor);
    const progress: string[] = [];
    const result = await gestor.callTool(
      { name: 'sprints_assign_tasks', arguments: { sprint: 'Sprint 16', project: 'PCL', refs: ['PCL-109', 'PAG-101', 'PCL-103'] } },
      { onprogress: (p) => void progress.push(`${p.progress}/${p.total}`) },
    );
    expect(progress).toEqual(['1/3', '2/3', '3/3']);
    expect(json<{ succeeded: number; processed: number }>(result)).toMatchObject({ processed: 3, succeeded: 2 });
  });
});

describe('autorização de negócio (papel + escopo)', () => {
  it('papel sem a capacidade: o CapabilityGuard nega com mensagem clara e registra denied', async () => {
    // o token do dev tem projects:read (scope ok), mas o papel dev não tem insights.view
    const dev = await as(TOKENS.dev);
    const result = await dev.callTool({ name: 'insights_summary', arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe('Permissão negada [permission_denied]: Sem permissão: o perfil “Desenvolvedor / Colaborador” não pode ver indicadores do Insights.');
    expect(lastAudit()).toMatchObject({ action: 'denied', userId: 'u8', source: 'mcp', summary: 'tentativa sem permissão: ver indicadores do Insights' });
  });

  it('dev com tasks:write não edita tarefa de outra pessoa (canTouchTask)', async () => {
    const dev = await as(TOKENS.dev);
    const result = await dev.callTool({ name: 'tasks_move', arguments: { ref: 'PCL-101', status: 'done' } });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe('Permissão negada [permission_denied]: Sem permissão: o perfil “Desenvolvedor / Colaborador” não pode editar a tarefa PCL-101.');
    expect(lastAudit()).toMatchObject({ action: 'denied', userId: 'u8', source: 'mcp' });
  });

  it('dev não atribui (sem task.assign) a outra pessoa, mas se atribui', async () => {
    const dev = await as(TOKENS.dev);
    const other = await dev.callTool({ name: 'tasks_assign', arguments: { ref: 'PCL-109', assignee: 'Isabela Rocha' } });
    expect(text(other)).toMatch(/não pode atribuir tarefas a outras pessoas/);
    const self = await dev.callTool({ name: 'tasks_assign', arguments: { ref: 'PCL-109', assignee: 'Camila Freitas' } });
    expect(json<{ task: { assignee: string } }>(self).task.assignee).toBe('Camila Freitas');
  });

  it('dev só enxerga projetos das suas equipes', async () => {
    const dev = await as(TOKENS.dev);
    const data = json<{ projects: { key: string }[] }>(await dev.callTool({ name: 'projects_list', arguments: {} }));
    expect(data.projects.map((p) => p.key).sort()).toEqual(['ONB', 'PCL', 'WEB']);
    expect(text(await dev.callTool({ name: 'projects_get', arguments: { project: 'PAG' } }))).toMatch(/não encontrado ou fora do seu escopo/);
  });

  it('o scope do token barra antes do papel: líder sem sprints:write', async () => {
    const lider = await as(TOKENS.lider);
    await expect(lider.callTool({ name: 'sprints_close', arguments: { sprint: 'sp-pcl-15' } })).rejects.toBeInstanceOf(InsufficientScopeError);
    const admin = await as(TOKENS.admin);
    const closed = json<{ sprint: { status: string } }>(await admin.callTool({ name: 'sprints_close', arguments: { sprint: 'sp-pcl-15' } }));
    expect(closed.sprint.status).toBe('done');
  });

  it('gestor da Vetor não toca tarefas da Atlas: "não encontrada" para o agente, denied na auditoria', async () => {
    const gestor = await as(TOKENS.gestor);
    const result = await gestor.callTool({ name: 'tasks_move', arguments: { ref: 'CMA-101', status: 'done' } });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/Tarefa "CMA-101" não encontrada ou fora do seu escopo/);
    expect(lastAudit()).toMatchObject({ action: 'denied', userId: 'u2', summary: 'tentativa sem permissão: mover a tarefa CMA-101 (fora do escopo)' });
    expect(t.store.read((db) => db.tasks.find((x) => x.ref === 'CMA-101')!.status)).toBe('in_progress');
  });

  it('token com todos os scopes não dá ao papel o que ele não tem', async () => {
    await t.close();
    const allScopes = ['projects:read', 'projects:write', 'tasks:read', 'tasks:write', 'sprints:write', 'audit:read', 'admin'];
    t = await createTestApp({ PF_TOKENS: JSON.stringify([{ token: 'pf-test-dev-todos-os-scopes', profile: 'dev-total', userId: 'u8', scopes: allScopes }]) });
    const dev = await as('pf-test-dev-todos-os-scopes');
    for (const [name, args, what] of [
      ['projects_create', { name: 'Projeto do dev', key: 'DEV' }, 'criar projetos'],
      ['projects_delete', { project: 'WEB', confirm: true }, 'excluir projetos'],
      ['sprints_close', { sprint: 'sp-pcl-15' }, 'encerrar sprints'],
      ['state_reset', { confirm: true }, 'restaurar os dados de demonstração'],
    ] as const) {
      const result = await dev.callTool({ name, arguments: args });
      expect(text(result)).toContain(`não pode ${what}`);
    }
    expect(t.store.read((db) => db.audit.filter((a) => a.action === 'denied' && a.userId === 'u8').length)).toBe(4);
    expect(t.store.read((db) => db.projects.some((p) => p.key === 'WEB'))).toBe(true);
  });
});

describe('projects_delete: confirmação', () => {
  it('cliente moderno com elicitação: pergunta ao usuário e exclui ao aceitar', async () => {
    const asked: string[] = [];
    const client = await connectEliciting(t.app, TOKENS.admin, { action: 'accept', content: { confirm: true } }, asked);
    clients.push(client);
    const result = await client.callTool({ name: 'projects_delete', arguments: { project: 'WEB' } });
    expect(result.isError).toBeFalsy();
    expect(json<{ key: string }>(result).key).toBe('WEB');
    expect(asked[0]).toMatch(/Excluir definitivamente o projeto WEB/);
    expect(t.store.read((db) => db.projects.some((p) => p.key === 'WEB'))).toBe(false);
    expect(lastAudit()).toMatchObject({ action: 'delete', source: 'mcp' });
  });

  it('cliente moderno: recusar a elicitação não exclui', async () => {
    const client = await connectEliciting(t.app, TOKENS.admin, { action: 'decline' });
    clients.push(client);
    const result = await client.callTool({ name: 'projects_delete', arguments: { project: 'WEB' } });
    expect(text(result)).toMatch(/cancelada pelo usuário/);
    expect(t.store.read((db) => db.projects.some((p) => p.key === 'WEB'))).toBe(true);
  });

  it('cliente legacy (2025): exige confirm: true', async () => {
    const legacy = await as(TOKENS.admin, 'legacy');
    const refused = await legacy.callTool({ name: 'projects_delete', arguments: { project: 'WEB' } });
    expect(refused.isError).toBe(true);
    expect(text(refused)).toMatch(/confirm: true/);
    expect(t.store.read((db) => db.projects.some((p) => p.key === 'WEB'))).toBe(true);
    const done = await legacy.callTool({ name: 'projects_delete', arguments: { project: 'WEB', confirm: true } });
    expect(json<{ key: string }>(done).key).toBe('WEB');
  });

  it('não pergunta sobre o que não pode excluir (fora do escopo → não encontrado)', async () => {
    const asked: string[] = [];
    const client = await connectEliciting(t.app, TOKENS.admin, { action: 'accept', content: { confirm: true } }, asked);
    clients.push(client);
    const result = await client.callTool({ name: 'projects_delete', arguments: { project: 'XYZ' } });
    expect(result.isError).toBe(true);
    expect(asked).toEqual([]);
  });
});

describe('administração do estado', () => {
  it('export → import (com progresso) → reset, só admin', async () => {
    const admin = await as(TOKENS.admin);
    const exported = await admin.callTool({ name: 'state_export', arguments: {} });
    const resource = (exported.content as { type: string; resource?: { text: string } }[])[1]!.resource!;
    const db = JSON.parse(resource.text);
    db.projects[0].name = 'Nome vindo do JSON importado';
    const progress: number[] = [];
    const imported = await admin.callTool(
      { name: 'state_import', arguments: { content: JSON.stringify(db), confirm: true } },
      { onprogress: (p) => void progress.push(p.progress) },
    );
    expect(imported.isError).toBeFalsy();
    expect(progress).toEqual([1, 2, 3, 4]);
    expect(t.store.read((x) => x.projects[0]!.name)).toBe('Nome vindo do JSON importado');
    const reset = json<{ seedSource: string }>(await admin.callTool({ name: 'state_reset', arguments: { confirm: true } }));
    expect(reset.seedSource).toBe('prototype');
    expect(t.store.read((x) => x.projects[0]!.name)).toBe('Portal do Cliente 2.0');
  });
});
