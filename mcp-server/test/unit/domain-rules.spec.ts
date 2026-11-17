import { assignAllowed, can, canSeeAudit, canTouchTask, visibleProjects } from '../../src/domain/access.js';
import { isDateOnly } from '../../src/domain/dates.js';
import { onTimeRate } from '../../src/domain/metrics.js';
import type { Db, Task } from '../../src/domain/model.js';
import { normalizeState } from '../../src/domain/state-shape.js';
import { sameValue, validateProject, validateTask, wouldCycle } from '../../src/domain/validation.js';
import { loadPrototypeSeed } from '../../src/state/seed.provider.js';
import { REPO_ROOT } from '../../src/config/paths.js';
import { join } from 'node:path';

const seed = loadPrototypeSeed(join(REPO_ROOT, 'js', 'data.js'));
let db: Db;
const user = (id: string) => db.users.find((u) => u.id === id)!;
const task = (ref: string) => db.tasks.find((t) => t.ref === ref)!;
const keys = (userId: string) => visibleProjects(db, user(userId)).map((p) => p.key).sort();

beforeEach(() => {
  const result = normalizeState(JSON.parse(JSON.stringify(seed.build())), seed.VERSION);
  if (!result.ok) throw new Error(result.reason);
  db = result.db;
});

describe('capacidades por papel (ROLE_CAPS de core.js)', () => {
  it('admin tem tudo; gestor não gerencia usuários nem exclui projetos', () => {
    expect(can(user('u1'), 'project.delete')).toBe(true);
    expect(can(user('u2'), 'project.create')).toBe(true);
    expect(can(user('u2'), 'project.delete')).toBe(false);
    expect(can(user('u2'), 'user.manage')).toBe(false);
  });

  it('dev cria e move tarefas mas não atribui nem vê auditoria; auditor só lê', () => {
    expect(can(user('u8'), 'task.create')).toBe(true);
    expect(can(user('u8'), 'task.assign')).toBe(false);
    expect(can(user('u8'), 'audit.view')).toBe(false);
    expect(can(user('u18'), 'audit.view')).toBe(true);
    expect(can(user('u18'), 'task.create')).toBe(false);
  });
});

describe('escopo por organização e equipe', () => {
  it('admin vê as duas organizações; gestor e auditor só a própria', () => {
    expect(keys('u1')).toContain('CMA');
    expect(keys('u2')).not.toContain('CMA');
    expect(keys('u18')).not.toContain('ERP');
    expect(keys('u2')).toContain('PAG');
  });

  it('dev só vê projetos das suas equipes (Camila: Produto & Web)', () => {
    expect(keys('u8')).toEqual(['ONB', 'PCL', 'WEB']);
  });

  it('arquivados só aparecem quando pedidos', () => {
    task('PCL-101'); // garante o seed carregado
    db.projects.find((p) => p.key === 'WEB')!.archived = true;
    expect(keys('u2')).not.toContain('WEB');
    expect(visibleProjects(db, user('u2'), { includeArchived: true }).map((p) => p.key)).toContain('WEB');
  });

  it('auditoria visível só da própria organização (admin vê tudo)', () => {
    const atlas = db.audit.find((a) => a.projectId === 'prj-cma')!;
    expect(canSeeAudit(db, user('u18'), atlas)).toBe(false);
    expect(canSeeAudit(db, user('u1'), atlas)).toBe(true);
  });
});

describe('canTouchTask e atribuição', () => {
  it('gestor da Vetor não toca tarefas da Atlas', () => {
    expect(canTouchTask(db, user('u2'), task('CMA-101'))).toBe(false);
    expect(canTouchTask(db, user('u2'), task('PCL-101'))).toBe(true);
  });

  it('dev edita as próprias, as que criou ou sem responsável — não as de outros', () => {
    expect(canTouchTask(db, user('u8'), task('PCL-109'))).toBe(true); // sem responsável
    expect(canTouchTask(db, user('u8'), task('PCL-101'))).toBe(false); // do Diego, criada pelo gestor
  });

  it('líder edita as da própria equipe', () => {
    // Ana (u4) lidera Plataforma; PAG-112 é da equipe Plataforma
    expect(canTouchTask(db, user('u4'), task('PAG-112'))).toBe(true);
  });

  it('sem task.assign só atribui a si mesmo', () => {
    expect(assignAllowed(user('u8'), null, 'u8')).toBe(true);
    expect(assignAllowed(user('u8'), null, 'u12')).toBe(false);
    expect(assignAllowed(user('u2'), null, 'u12')).toBe(true);
  });
});

describe('validações', () => {
  it('recusa título vazio, prioridade, status e tipo fora do domínio', () => {
    expect(validateTask(db, { title: '  ' }, 'prj-pcl', null)).toMatch(/título é obrigatório/);
    expect(validateTask(db, { title: 'ok', priority: 'altíssima' as never }, 'prj-pcl', null)).toMatch(/Prioridade inválida/);
    expect(validateTask(db, { title: 'ok', status: 'doing' as never }, 'prj-pcl', null)).toMatch(/Status inválido/);
    expect(validateTask(db, { title: 'ok', type: 'story' as never }, 'prj-pcl', null)).toMatch(/Tipo inválido/);
  });

  it('prazo precisa ser data real AAAA-MM-DD', () => {
    expect(isDateOnly('2026-02-30')).toBe(false);
    expect(validateTask(db, { title: 'ok', dueDate: '2026-02-30' }, 'prj-pcl', null)).toMatch(/Prazo inválido/);
    expect(validateTask(db, { title: 'ok', dueDate: '2026-12-01' }, 'prj-pcl', null)).toBeNull();
  });

  it('responsável precisa ser membro ativo das equipes do projeto', () => {
    expect(validateTask(db, { title: 'ok', assigneeId: 'u17' }, 'prj-pcl', null)).toMatch(/membro ativo/);
  });

  it('chave de projeto com 2 a 4 letras e datas coerentes', () => {
    expect(validateProject({ name: 'X', key: 'P1' }, null)).toMatch(/2 a 4 letras/);
    expect(validateProject({ name: 'X', key: 'ABCDE' }, null)).toMatch(/2 a 4 letras/);
    expect(validateProject({ name: 'X', key: 'abc' }, null)).toBeNull();
    expect(validateProject({ name: 'X', key: 'ABC', startDate: '2026-05-10', targetDate: '2026-05-01' }, null)).toMatch(/anterior ao início/);
  });

  it('detecta dependência circular direta e indireta', () => {
    const a = task('PCL-101');
    const b = task('PCL-107'); // PCL-107 já é bloqueada por PCL-101
    expect(b.blockedBy).toContain(a.id);
    expect(wouldCycle(db, a.id, b.id)).toBe(true);
    expect(validateTask(db, { blockedBy: [b.id] }, 'prj-pcl', a)).toMatch(/circular/);
    const c = task('PCL-103');
    c.blockedBy = [b.id]; // 103 → 107 → 101
    expect(validateTask(db, { blockedBy: [c.id] }, 'prj-pcl', a)).toMatch(/circular/);
  });

  it('conjuntos não mudam pela ordem', () => {
    expect(sameValue('labels', ['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameValue('title', 'a', 'b')).toBe(false);
  });
});

describe('estado salvo (shapeOk, migração e saneamento)', () => {
  it('migra schema 1: doneAt a partir de updatedAt', () => {
    const old = JSON.parse(JSON.stringify(db)) as Omit<Db, 'tasks'> & { tasks: Partial<Task>[] };
    old.meta.schema = 1;
    const done = old.tasks.find((t) => t.status === 'done')!;
    delete done.doneAt;
    const result = normalizeState(old, seed.VERSION);
    expect(result.ok && result.db.tasks.find((t) => t.id === done.id)!.doneAt).toBe(done.updatedAt);
  });

  it('recusa outra versão do seed e formatos incompletos', () => {
    expect(normalizeState({ ...db, meta: { seedVersion: 1 } }, seed.VERSION)).toMatchObject({ ok: false });
    expect(normalizeState({ meta: { seedVersion: seed.VERSION } }, seed.VERSION)).toMatchObject({ ok: false });
  });

  it('recusa JSON com aninhamento excessivo sem estourar a pilha', () => {
    const raw = JSON.parse(JSON.stringify(db));
    raw.projects[0].deep = JSON.parse('['.repeat(100_000) + ']'.repeat(100_000));
    expect(normalizeState(raw, seed.VERSION)).toMatchObject({ ok: false, reason: expect.stringMatching(/aninhamento/) });
  });

  it('saneia status e prioridade desconhecidos', () => {
    const raw = JSON.parse(JSON.stringify(db));
    raw.tasks[0].status = 'doing';
    raw.tasks[0].priority = 'p0';
    const result = normalizeState(raw, seed.VERSION);
    expect(result.ok && [result.db.tasks[0]!.status, result.db.tasks[0]!.priority]).toEqual(['todo', 'medium']);
  });

  it('cumprimento de prazo compara o dia da conclusão com o prazo', () => {
    const base = { status: 'done' } as Task;
    expect(onTimeRate([{ ...base, dueDate: '2026-01-10', doneAt: '2026-01-09T12:00:00' }, { ...base, dueDate: '2026-01-10', doneAt: '2026-01-12T12:00:00' }])).toBe(50);
    expect(onTimeRate([])).toBeNull();
  });
});
