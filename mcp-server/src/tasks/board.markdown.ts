import { PRIORITY_LABELS } from '../domain/constants.js';
import type { Priority } from '../domain/model.js';
import type { TasksService } from './tasks.service.js';

type Board = ReturnType<TasksService['board']>;

/** Quadro Kanban em markdown: uma seção por coluna, uma linha por cartão. */
export function boardMarkdown(board: Board): string {
  const lines = [`# Quadro ${board.project.key} — ${board.project.name}`, ''];
  if (board.activeSprint) {
    lines.push(`Sprint ativa: **${board.activeSprint.name}** (até ${board.activeSprint.endDate}) — meta: ${board.activeSprint.goal || '—'}`, '');
  }
  for (const col of board.columns) {
    lines.push(`## ${col.label} (${col.tasks.length})`, '');
    if (!col.tasks.length) lines.push('_vazio_');
    for (const t of col.tasks) {
      const flags = [t.type === 'bug' ? 'bug' : null, t.overdue ? 'ATRASADA' : null, t.blocked ? 'BLOQUEADA' : null].filter(Boolean).join(', ');
      const due = t.dueDate ? ` · prazo ${t.dueDate}` : '';
      lines.push(`- **${t.ref}** ${t.title} · ${PRIORITY_LABELS[t.priority as Priority] ?? t.priority} · ${t.assignee ?? 'sem responsável'}${due}${flags ? ` · ${flags}` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
