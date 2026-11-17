import { NotFoundError, PermissionDeniedError, ValidationError } from '../../src/domain/errors.js';
import { createServices, type Services } from '../support/services.js';

let s: Services;
const task = (ref: string) => s.db().tasks.find((t) => t.ref === ref)!;
const lastAudit = () => s.db().audit[0]!;

beforeEach(async () => {
  s = await createServices();
});

afterEach(async () => {
  await s.moduleRef.close();
});

describe('TasksService.create', () => {
  it('cria com ref sequencial, auditoria mcp e evento task.created.v1', async () => {
    const gestor = s.actor('u2');
    const created = await s.tasks.create(gestor, { project: 'pcl', title: '  Validar contestação  ', priority: 'high', assignee: 'Camila Freitas' });
    expect(created.ref).toBe('PCL-120');
    expect(created.title).toBe('Validar contestação');
    expect(created.assignee).toBe('Camila Freitas');
    const audit = s.db().audit.find((a) => a.entityId === created.id && a.action === 'create')!;
    expect(audit).toMatchObject({ source: 'mcp', userId: 'u2', summary: 'criou a tarefa PCL-120' });
    const types = s.db().events.filter((e) => e.entityId === created.id).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['task.created.v1', 'task.assigned.v1']));
    expect(audit.eventId).toBeDefined();
    expect(s.repository.saved?.tasks.some((t) => t.ref === 'PCL-120')).toBe(true);
  });

  it('recusa responsável fora das equipes do projeto', async () => {
    await expect(s.tasks.create(s.actor('u2'), { project: 'PCL', title: 'x', assignee: 'Thiago Barbosa' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('dev não atribui a outra pessoa: negação com registro denied', async () => {
    await expect(s.tasks.create(s.actor('u8'), { project: 'PCL', title: 'x', assignee: 'Isabela Rocha' })).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(lastAudit()).toMatchObject({ action: 'denied', userId: 'u8', source: 'mcp', summary: 'tentativa sem permissão: atribuir tarefas a outras pessoas' });
    expect(s.db().tasks.some((t) => t.ref === 'PCL-120')).toBe(false); // nada além da negação foi gravado
  });

  it('projeto de outra organização responde como inexistente, mas a tentativa fica na auditoria', async () => {
    const error = await s.tasks.create(s.actor('u2'), { project: 'CMA', title: 'x' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as Error).message).toMatch(/não encontrado ou fora do seu escopo/);
    expect(lastAudit()).toMatchObject({ action: 'denied', summary: expect.stringContaining('CMA (fora do escopo)') });
  });

  it('auditor (sem task.create) é negado', async () => {
    await expect(s.tasks.create(s.actor('u18'), { project: 'PCL', title: 'x' })).rejects.toThrow(/Visualizador \/ Auditor.*criar tarefas/);
  });
});

describe('TasksService.move e doneAt', () => {
  it('concluir grava doneAt; reabrir limpa; emite status_changed e completed', async () => {
    const gestor = s.actor('u2');
    const moved = await s.tasks.move(gestor, 'PCL-101', 'done');
    expect(moved.changed).toEqual(['status']);
    expect(task('PCL-101').doneAt).toBe(task('PCL-101').updatedAt);
    const types = s.db().events.filter((e) => e.entityId === task('PCL-101').id).slice(0, 2).map((e) => e.type);
    expect(types).toEqual(['task.completed.v1', 'task.status_changed.v1']);
    expect(lastAudit()).toMatchObject({ action: 'status', before: { status: 'in_progress' }, after: { status: 'done' }, summary: 'moveu PCL-101 de Em andamento para Concluído' });

    await s.tasks.move(gestor, 'PCL-101', 'in_review');
    expect(task('PCL-101').doneAt).toBeNull();
  });

  it('mover para o mesmo status não grava nada', async () => {
    const before = s.db().audit.length;
    const result = await s.tasks.move(s.actor('u2'), 'PCL-101', 'in_progress');
    expect(result.changed).toEqual([]);
    expect(s.db().audit.length).toBe(before);
  });

  it('dev não move tarefa de outra pessoa', async () => {
    await expect(s.tasks.move(s.actor('u8'), 'PCL-101', 'done')).rejects.toThrow(/não pode editar a tarefa PCL-101/);
    expect(task('PCL-101').status).toBe('in_progress');
  });

  it('webhook com URL .local registra 3 tentativas 503', async () => {
    await s.tasks.create(s.actor('u2'), { project: 'PCL', title: 'gera task.created.v1' });
    const failed = s.db().deliveries.find((d) => d.webhookId === 'wh2' && d.eventType === 'task.created.v1')!;
    expect(failed.status).toBe('failed');
    expect(failed.attempts.map((a) => a.httpStatus)).toEqual([503, 503, 503]);
  });
});

describe('TasksService.update, assign, comment e dependências', () => {
  it('atualiza só o que mudou e audita prioridade como "priority"', async () => {
    const previous = task('PCL-103').priority;
    const next = previous === 'urgent' ? 'low' : 'urgent';
    const { changed } = await s.tasks.update(s.actor('u2'), 'PCL-103', { priority: next, title: task('PCL-103').title });
    expect(changed).toEqual(['priority']);
    expect(lastAudit()).toMatchObject({ action: 'priority', before: { priority: previous }, after: { priority: next } });
  });

  it('dev se atribui uma tarefa sem responsável', async () => {
    const result = await s.tasks.assign(s.actor('u8'), 'PCL-109', 'camila.freitas@vetorlabs.dev');
    expect(result.task.assignee).toBe('Camila Freitas');
  });

  it('comentário com menção gera comment.mention.v1', async () => {
    const result = await s.tasks.comment(s.actor('u2'), 'PCL-101', '@Diego Martins consegue revisar hoje?');
    expect(result.mentioned).toEqual(['Diego Martins']);
    expect(s.db().events[0]!.type).toBe('comment.mention.v1');
  });

  it('cria e remove dependência; recusa ciclo', async () => {
    const gestor = s.actor('u2');
    const linked = await s.tasks.linkDependency(gestor, 'PCL-103', 'PCL-105');
    expect(linked.blockedBy).toEqual(['PCL-105']);
    expect(s.db().events[0]!.type).toBe('task.blocked.v1');
    // PCL-107 já depende de PCL-101: o inverso fecharia um ciclo
    await expect(s.tasks.linkDependency(gestor, 'PCL-101', 'PCL-107')).rejects.toThrow(/circular/);
    const unlinked = await s.tasks.unlinkDependency(gestor, 'PCL-103', 'PCL-105');
    expect(unlinked.blockedBy).toEqual([]);
    expect(lastAudit().action).toBe('unblock');
  });

  it('dependência entre projetos diferentes é recusada', async () => {
    await expect(s.tasks.linkDependency(s.actor('u2'), 'PCL-103', 'PAG-101')).rejects.toThrow(/mesmo projeto/);
  });
});

describe('TasksService.list e get', () => {
  it('dev vê só tarefas dos projetos das suas equipes', () => {
    const { tasks } = s.tasks.list(s.actor('u8'), { limit: 100 });
    expect(new Set(tasks.map((t) => t.project))).toEqual(new Set(['PCL', 'WEB', 'ONB']));
  });

  it('filtra por status, responsável "me" e bloqueio', () => {
    const blocked = s.tasks.list(s.actor('u2'), { project: 'PCL', blocked: true });
    expect(blocked.tasks.map((t) => t.ref)).toContain('PCL-107');
    const mine = s.tasks.list(s.actor('u2'), { assignee: 'me', project: 'PCL' });
    expect(mine.tasks.every((t) => t.assignee === 'Ricardo Nogueira')).toBe(true);
  });

  it('tarefa de outra organização não é encontrada', () => {
    expect(() => s.tasks.get(s.actor('u2'), 'CMA-101')).toThrow(NotFoundError);
    expect(s.tasks.get(s.actor('u1'), 'CMA-101').project).toBe('CMA');
  });
});
