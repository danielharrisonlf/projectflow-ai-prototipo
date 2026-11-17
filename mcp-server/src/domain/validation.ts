/* Validação de entrada (PF.validateTask / PF.validateProject / PF.wouldCycle de core.js).
   Devolvem a mensagem do primeiro problema encontrado ou null. */
import { projectMembers } from './access.js';
import { LABELS, PRIORITIES, PROJECT_STATUSES, TASK_STATUSES, TASK_TYPES } from './constants.js';
import { isDateOnly } from './dates.js';
import type { Db, Project, Task } from './model.js';

/** Campos tratados como conjunto: a ordem não é mudança. */
const SET_FIELDS = new Set(['teamIds', 'labels', 'blockedBy', 'events']);

export function sameValue(key: string, a: unknown, b: unknown): boolean {
  if (SET_FIELDS.has(key) && Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

export function strOk(value: unknown, max: number, required = false): boolean {
  if (value == null || value === '') return !required;
  return typeof value === 'string' && (!required || value.trim().length > 0) && value.length <= max;
}

/** blockerId já depende (direta ou indiretamente) de taskId? */
export function wouldCycle(db: Db, taskId: string, blockerId: string): boolean {
  const seen = new Set<string>();
  const stack = [blockerId];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const x = db.tasks.find((t) => t.id === id);
    if (x) stack.push(...(x.blockedBy ?? []));
  }
  return false;
}

export type TaskFields = Partial<Omit<Task, 'id' | 'ref' | 'projectId' | 'createdAt' | 'updatedAt' | 'createdBy'>>;

/** t = tarefa atual (edição) ou null (criação). */
export function validateTask(db: Db, fields: TaskFields, projectId: string, t: Task | null): string | null {
  const p = db.projects.find((x) => x.id === projectId);
  if (!p) return 'Projeto não encontrado.';
  const f = fields as Record<string, unknown>;
  const changed = (k: string) => k in f && (!t || !sameValue(k, (t as unknown as Record<string, unknown>)[k], f[k]));

  if ((!t || 'title' in f) && !strOk(f.title, 120, true)) return 'O título é obrigatório (texto de até 120 caracteres).';
  if (changed('desc') && !strOk(f.desc, 5000)) return 'A descrição deve ser texto de até 5000 caracteres.';
  if (changed('status') && !TASK_STATUSES.includes(f.status as never)) return `Status inválido. Use: ${TASK_STATUSES.join(', ')}.`;
  if (changed('priority') && !PRIORITIES.includes(f.priority as never)) return `Prioridade inválida. Use: ${PRIORITIES.join(', ')}.`;
  if (changed('type') && !TASK_TYPES.includes(f.type as never)) return 'Tipo inválido. Use: task ou bug.';
  if (changed('dueDate') && f.dueDate != null && f.dueDate !== '' && !isDateOnly(f.dueDate)) return 'Prazo inválido: use o formato AAAA-MM-DD.';
  if (changed('teamId') && f.teamId && !p.teamIds.includes(f.teamId as string)) return 'A equipe precisa estar associada ao projeto.';
  if (changed('epicId') && f.epicId) {
    const ep = db.epics.find((e) => e.id === f.epicId);
    if (!ep || ep.projectId !== p.id) return 'O épico precisa ser do mesmo projeto.';
  }
  if (changed('sprintId') && f.sprintId) {
    const sp = db.sprints.find((s) => s.id === f.sprintId);
    if (!sp || sp.projectId !== p.id) return 'A sprint precisa ser do mesmo projeto.';
    if (sp.status === 'done') return `A ${sp.name} já foi encerrada; escolha uma sprint ativa ou planejada.`;
  }
  if (changed('assigneeId') && f.assigneeId && !projectMembers(db, p.id).some((u) => u.id === f.assigneeId)) {
    return 'O responsável precisa ser membro ativo das equipes do projeto.';
  }
  if (changed('labels') && (!Array.isArray(f.labels) || f.labels.some((l) => !LABELS.includes(l as never)))) {
    return `Etiqueta desconhecida. Use: ${LABELS.join(', ')}.`;
  }
  if (
    changed('acceptance') &&
    (!Array.isArray(f.acceptance) || f.acceptance.some((a: { text?: unknown } | null) => !a || !strOk(a.text, 300, true)))
  ) {
    return 'Critérios de aceite inválidos.';
  }
  if (changed('blockedBy')) {
    if (!Array.isArray(f.blockedBy)) return 'Dependências inválidas.';
    for (const bid of f.blockedBy as string[]) {
      if (t && t.blockedBy.includes(bid)) continue; // já existentes não são revalidadas
      const b = db.tasks.find((x) => x.id === bid);
      if (!b || b.projectId !== p.id) return 'A tarefa bloqueadora precisa ser do mesmo projeto.';
      if (t && (bid === t.id || wouldCycle(db, t.id, bid))) return `${b.ref} já depende de ${t.ref} — a dependência seria circular.`;
    }
  }
  return null;
}

export type ProjectFields = Partial<Pick<Project, 'name' | 'key' | 'desc' | 'priority' | 'status' | 'startDate' | 'targetDate' | 'leadId' | 'teamIds'>>;

export function validateProject(fields: ProjectFields, existing: Project | null): string | null {
  const f = fields as Record<string, unknown>;
  if ((!existing || 'name' in f) && !strOk(f.name, 80, true)) return 'O nome do projeto é obrigatório (até 80 caracteres).';
  if (!existing && !/^[A-Z]{2,4}$/.test(String(f.key ?? '').toUpperCase())) return 'A chave deve ter de 2 a 4 letras (ex.: PCL).';
  if ('desc' in f && !strOk(f.desc, 2000)) return 'A descrição deve ser texto de até 2000 caracteres.';
  if ('priority' in f && f.priority != null && !PRIORITIES.includes(f.priority as never)) return 'Prioridade inválida.';
  if ('status' in f && f.status != null && !PROJECT_STATUSES.includes(f.status as never)) return 'Status de projeto inválido.';
  const start = 'startDate' in f ? f.startDate : existing?.startDate;
  const target = 'targetDate' in f ? f.targetDate : existing?.targetDate;
  if (start && !isDateOnly(start)) return 'Data de início inválida.';
  if (target && !isDateOnly(target)) return 'Data de entrega inválida.';
  if (start && target && (target as string) < (start as string)) return 'A data de entrega não pode ser anterior ao início.';
  return null;
}
