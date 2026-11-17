/* Formatação do contexto embutido nos prompts (markdown curto, legível pelo modelo). */
import type { PromptMessage } from '@modelcontextprotocol/server';
import { PRIORITY_LABELS, STATUS_LABELS } from '../domain/constants.js';
import type { Priority, TaskStatus } from '../domain/model.js';

export interface TaskLineView {
  ref: string;
  title: string;
  status: string;
  priority: string;
  assignee: string | null;
  dueDate: string | null;
  overdue: boolean;
  blocked: boolean;
  sprint?: string | null;
}

export function taskLine(t: TaskLineView): string {
  const flags = [t.overdue ? 'ATRASADA' : null, t.blocked ? 'BLOQUEADA' : null].filter(Boolean).join(', ');
  return [
    `- ${t.ref} · ${t.title}`,
    STATUS_LABELS[t.status as TaskStatus] ?? t.status,
    PRIORITY_LABELS[t.priority as Priority] ?? t.priority,
    t.assignee ?? 'sem responsável',
    t.dueDate ? `prazo ${t.dueDate}` : 'sem prazo',
    t.sprint ? t.sprint : null,
    flags || null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function taskList(tasks: TaskLineView[], empty = '_nenhuma_'): string {
  return tasks.length ? tasks.map(taskLine).join('\n') : empty;
}

/** Contexto como recurso embutido (JSON) + instruções em texto. */
export function promptMessages(resource: { uri: string; data: unknown }, text: string): PromptMessage[] {
  return [
    { role: 'user', content: { type: 'resource', resource: { uri: resource.uri, mimeType: 'application/json', text: JSON.stringify(resource.data, null, 2) } } },
    { role: 'user', content: { type: 'text', text } },
  ];
}
