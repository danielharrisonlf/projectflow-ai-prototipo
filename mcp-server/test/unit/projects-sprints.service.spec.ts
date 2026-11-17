import { ConflictError, PermissionDeniedError, ValidationError } from '../../src/domain/errors.js';
import { createServices, type Services } from '../support/services.js';

let s: Services;

beforeEach(async () => {
  s = await createServices();
});

afterEach(async () => {
  await s.moduleRef.close();
});

describe('ProjectsService', () => {
  it('gestor cria projeto com chave única em maiúsculas e evento project.created.v1', async () => {
    const p = await s.projects.create(s.actor('u2'), { name: 'Portal de Parceiros', key: 'prt', teams: ['Plataforma'] });
    expect(p).toMatchObject({ key: 'PRT', status: 'active', lead: 'Ricardo Nogueira', teams: ['Plataforma'], org: 'Vetor Labs' });
    expect(s.db().events[0]).toMatchObject({ type: 'project.created.v1', payload: { key: 'PRT' } });
    await expect(s.projects.create(s.actor('u2'), { name: 'Outro', key: 'PRT' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('dev não cria projetos (negação auditada)', async () => {
    await expect(s.projects.create(s.actor('u8'), { name: 'X', key: 'XX' })).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(s.db().audit[0]).toMatchObject({ action: 'denied', summary: 'tentativa sem permissão: criar projetos', source: 'mcp' });
  });

  it('atualiza só os campos alterados e valida datas', async () => {
    const result = await s.projects.update(s.actor('u2'), { project: 'PCL', fields: { priority: 'urgent', name: 'Portal do Cliente 2.0' } });
    expect(result.changed).toEqual(['priority']);
    await expect(s.projects.update(s.actor('u2'), { project: 'PCL', fields: { targetDate: '2000-01-01' } })).rejects.toBeInstanceOf(ValidationError);
  });

  it('arquiva, lista arquivados e desarquiva', async () => {
    await s.projects.archive(s.actor('u2'), 'WEB');
    expect(s.projects.list(s.actor('u2')).projects.map((p) => p.key)).not.toContain('WEB');
    expect(s.projects.list(s.actor('u2'), { status: 'archived' }).projects.map((p) => p.key)).toEqual(['WEB']);
    await expect(s.projects.archive(s.actor('u2'), 'WEB')).rejects.toBeInstanceOf(ConflictError);
    await s.projects.unarchive(s.actor('u2'), 'WEB');
    expect(s.db().events[0]!.type).toBe('project.unarchived.v1');
  });

  it('exclusão em cascata sem deixar nada órfão (só admin)', async () => {
    await expect(s.projects.delete(s.actor('u2'), 'PCL')).rejects.toBeInstanceOf(PermissionDeniedError);
    const result = await s.projects.delete(s.actor('u1'), 'PCL');
    expect(result.deletedTasks).toBeGreaterThan(10);
    const db = s.db();
    expect(db.projects.some((p) => p.key === 'PCL')).toBe(false);
    expect(db.tasks.some((t) => t.projectId === 'prj-pcl')).toBe(false);
    expect(db.sprints.some((x) => x.projectId === 'prj-pcl')).toBe(false);
    expect(db.users.every((u) => !u.favoriteProjectIds?.includes('prj-pcl'))).toBe(true);
    expect(db.taskCounters['prj-pcl']).toBeUndefined();
  });
});

describe('SprintsService', () => {
  it('só uma sprint ativa por projeto', async () => {
    await expect(s.sprints.start(s.actor('u2'), 'sp-pcl-16')).rejects.toThrow(/Já existe uma sprint ativa: encerre a Sprint 15/);
  });

  it('encerrar devolve as tarefas abertas ao backlog e emite sprint.completed.v1', async () => {
    const open = s.db().tasks.filter((t) => t.sprintId === 'sp-pcl-15' && t.status !== 'done').map((t) => t.ref);
    const result = await s.sprints.close(s.actor('u2'), 'Sprint 15', 'PCL');
    expect(result.returnedToBacklog.sort()).toEqual(open.sort());
    expect(s.db().tasks.filter((t) => open.includes(t.ref)).every((t) => t.sprintId === null)).toBe(true);
    expect(s.db().events[0]).toMatchObject({ type: 'sprint.completed.v1' });
    const started = await s.sprints.start(s.actor('u2'), 'sp-pcl-16');
    expect(started.status).toBe('active');
  });

  it('cria sprint com nome único e datas válidas', async () => {
    await expect(s.sprints.create(s.actor('u2'), { project: 'PCL', name: 'sprint 16', startDate: '2026-12-01', endDate: '2026-12-14' })).rejects.toBeInstanceOf(ConflictError);
    await expect(s.sprints.create(s.actor('u2'), { project: 'PCL', name: 'Sprint 17', startDate: '2026-12-14', endDate: '2026-12-01' })).rejects.toBeInstanceOf(ValidationError);
    const created = await s.sprints.create(s.actor('u2'), { project: 'PCL', name: 'Sprint 17', startDate: '2026-12-15', endDate: '2026-12-29' });
    expect(created).toMatchObject({ status: 'planned', project: 'PCL' });
  });

  it('associa em lote com progresso, falhas individuais e cancelamento', async () => {
    const progress: number[] = [];
    const controller = new AbortController();
    const result = await s.sprints.assignTasks(
      s.actor('u2'),
      { sprint: 'sp-pcl-16', refs: ['PCL-109', 'PAG-101', 'PCL-103', 'PCL-111'] },
      {
        signal: controller.signal,
        onProgress: (done) => {
          progress.push(done);
          if (done === 3) controller.abort();
        },
      },
    );
    expect(progress).toEqual([1, 2, 3]);
    expect(result).toMatchObject({ processed: 3, cancelled: true, succeeded: 2 });
    expect(result.results[1]).toMatchObject({ ref: 'PAG-101', ok: false });
    expect(s.db().tasks.find((t) => t.ref === 'PCL-111')!.sprintId).toBe('sp-pcl-15'); // não processada
  });

  it('dev não gerencia sprints', async () => {
    await expect(s.sprints.close(s.actor('u8'), 'sp-pcl-15')).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});

describe('Insights, auditoria e webhooks', () => {
  it('KPIs respeitam o escopo (gestor não conta a Atlas)', async () => {
    const vetor = await s.insights.summary(s.actor('u2'));
    const all = await s.insights.summary(s.actor('u1'));
    expect(all.kpis.projectsInScope - vetor.kpis.projectsInScope).toBe(2);
    expect(vetor.tasksByStatus.map((x) => x.status)).toEqual(['backlog', 'todo', 'in_progress', 'in_review', 'done']);
    await expect(s.insights.summary(s.actor('u8'))).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('busca na auditoria por origem e ação', async () => {
    await s.tasks.move(s.actor('u2'), 'PCL-101', 'in_review');
    const found = await s.audit.search(s.actor('u18'), { source: 'mcp', action: 'status' });
    expect(found.entries[0]).toMatchObject({ user: 'Ricardo Nogueira', project: 'PCL', source: 'mcp' });
  });

  it('reenvio manual marca a entrega como sucesso (só admin)', async () => {
    // project.created.v1 vai para o "ERP Financeiro (interno)", cuja URL .local falha
    await s.projects.create(s.actor('u2'), { name: 'Gera entrega com falha', key: 'GEF' });
    const failed = s.db().deliveries.find((d) => d.status === 'failed')!;
    expect(failed.attempts).toHaveLength(3);
    await expect(s.webhooks.redeliver(s.actor('u2'), failed.id)).rejects.toBeInstanceOf(PermissionDeniedError);
    const result = await s.webhooks.redeliver(s.actor('u1'), failed.id);
    expect(result.status).toBe('success');
    expect(result.attempts.at(-1)).toMatchObject({ httpStatus: 200, manual: true });
  });

  it('lista webhooks com o segredo mascarado', async () => {
    const list = await s.webhooks.list(s.actor('u1'));
    expect(list.every((w) => w.secret.endsWith('…') && w.secret.length <= 11)).toBe(true);
  });
});
