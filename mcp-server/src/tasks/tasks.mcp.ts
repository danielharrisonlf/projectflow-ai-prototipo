import { Injectable } from '@nestjs/common';
import { ResourceTemplate, Tool, type McpContext } from '@nestjs/mcp';
import * as z from 'zod';
import type { Priority, TaskStatus, TaskType } from '../domain/model.js';
import { ActorResolver } from '../identity/actor.resolver.js';
import { SCOPES } from '../mcp/auth/scopes.js';
import { RequiresCap } from '../mcp/guards/requires-cap.decorator.js';
import {
  dateOnly,
  label,
  person,
  priority,
  projectRef,
  READ_ONLY,
  sprintRef,
  TaskDetailOut,
  TaskListOut,
  taskRef,
  taskStatus,
  taskType,
  WRITE,
  WRITE_IDEMPOTENT,
} from '../mcp/schemas.js';
import { boardMarkdown } from './board.markdown.js';
import { TasksService } from './tasks.service.js';

const ListInput = z.object({
  project: projectRef.optional(),
  status: taskStatus.optional(),
  assignee: person.optional().describe('Responsável: nome completo, e-mail, id, "me" (você) ou "none" (sem responsável).'),
  sprint: sprintRef.optional(),
  type: taskType.optional(),
  priority: priority.optional(),
  label: label.optional().describe('Etiqueta (backend, frontend, mobile, infra, dados, ux, seguranca, performance, documentacao, cliente).'),
  overdue: z.boolean().optional().describe('true = só atrasadas (prazo vencido e não concluídas); false = só as em dia.'),
  blocked: z.boolean().optional().describe('true = só bloqueadas por dependência aberta.'),
  search: z.string().max(120).optional().describe('Trecho do título ou ref exato.'),
  includeSubtasks: z.boolean().optional().describe('Inclui subtarefas (padrão: não).'),
  limit: z.number().int().min(1).max(100).optional().describe('Máximo de tarefas (padrão 25, máximo 100).'),
});
const RefInput = z.object({ ref: taskRef });
const CreateInput = z.object({
  project: projectRef,
  title: z.string().trim().min(1).max(120).describe('Título (até 120 caracteres).'),
  type: taskType.optional().describe('task (padrão), bug ou subtask (exige parent).'),
  priority: priority.optional().describe('Prioridade (padrão medium).'),
  assignee: person.optional().describe('Responsável (nome completo, e-mail ou id), membro das equipes do projeto. Sem task.assign, só você mesmo.'),
  description: z.string().max(5000).optional().describe('Descrição em texto/markdown (até 5000 caracteres).'),
  dueDate: dateOnly.optional().describe('Prazo (AAAA-MM-DD).'),
  epic: z.string().max(80).optional().describe('Épico do mesmo projeto (nome ou id).'),
  sprint: sprintRef.optional().describe('Sprint do mesmo projeto, não encerrada (id ou nome).'),
  labels: z.array(label).max(10).optional().describe('Etiquetas.'),
  parent: taskRef.optional().describe('Tarefa-mãe (para subtask), do mesmo projeto.'),
});
const UpdateInput = z.object({
  ref: taskRef,
  fields: z
    .object({
      title: z.string().trim().min(1).max(120).optional(),
      description: z.string().max(5000).optional(),
      priority: priority.optional(),
      dueDate: dateOnly.nullable().optional().describe('Prazo (AAAA-MM-DD) ou null para remover.'),
      labels: z.array(label).max(10).optional().describe('Substitui as etiquetas.'),
      acceptance: z
        .array(z.object({ text: z.string().trim().min(1).max(300), done: z.boolean() }))
        .max(20)
        .optional()
        .describe('Substitui os critérios de aceite.'),
      epic: z.string().max(80).nullable().optional().describe('Épico do projeto (nome ou id) ou null.'),
    })
    .describe('Campos a alterar. Status, responsável e dependências têm ferramentas próprias.'),
});
const MoveInput = z.object({ ref: taskRef, status: taskStatus });
const AssignInput = z.object({
  ref: taskRef,
  assignee: person.nullable().describe('Novo responsável (nome completo, e-mail ou id) ou null para deixar sem responsável.'),
});
const CommentInput = z.object({
  ref: taskRef,
  text: z.string().trim().min(1).max(4000).describe('Comentário (até 4000 caracteres). Mencione pessoas com @Nome Sobrenome para notificá-las.'),
});
const LinkInput = z.object({
  ref: taskRef.describe('Tarefa que fica bloqueada (ex.: PCL-110).'),
  blockedBy: taskRef.describe('Tarefa bloqueadora, do mesmo projeto (ex.: PCL-104).'),
});

/** Ferramentas e recursos de tarefas: finos, delegam ao TasksService. */
@Injectable()
export class TasksMcp {
  constructor(
    private readonly tasks: TasksService,
    private readonly actors: ActorResolver,
  ) {}

  @Tool({
    name: 'tasks_list',
    title: 'Listar tarefas',
    description:
      'Lista tarefas visíveis com filtros por projeto, status, responsável, sprint, tipo, prioridade, etiqueta, atraso e bloqueio. Retorna até `limit` (padrão 25) e o total encontrado; subtarefas só com includeSubtasks.',
    inputSchema: ListInput,
    outputSchema: TaskListOut,
    annotations: READ_ONLY,
    scopes: [SCOPES.tasksRead],
  })
  @RequiresCap('task.view')
  list(input: z.infer<typeof ListInput>, ctx: McpContext) {
    return this.tasks.list(this.actors.resolve(ctx), {
      ...input,
      status: input.status as TaskStatus | undefined,
      type: input.type as TaskType | undefined,
      priority: input.priority as Priority | undefined,
    });
  }

  @Tool({
    name: 'tasks_get',
    title: 'Detalhar tarefa',
    description:
      'Retorna uma tarefa pelo ref (ex.: PCL-124) com descrição, critérios de aceite, etiquetas, épico, subtarefas, dependências (bloqueada por / bloqueando), comentários e histórico da auditoria.',
    inputSchema: RefInput,
    outputSchema: TaskDetailOut,
    annotations: READ_ONLY,
    scopes: [SCOPES.tasksRead],
  })
  @RequiresCap('task.view')
  get(input: z.infer<typeof RefInput>, ctx: McpContext) {
    return this.tasks.get(this.actors.resolve(ctx), input.ref);
  }

  @Tool({
    name: 'tasks_create',
    title: 'Criar tarefa',
    description:
      'Cria uma tarefa (status "todo") em um projeto visível. O ref é gerado a partir da chave do projeto (PCL-125). Emite task.created.v1 (e task.assigned.v1 se houver responsável).',
    inputSchema: CreateInput,
    annotations: WRITE,
    scopes: [SCOPES.tasksWrite],
  })
  @RequiresCap('task.create')
  create(input: z.infer<typeof CreateInput>, ctx: McpContext) {
    return this.tasks.create(this.actors.resolve(ctx), {
      ...input,
      type: input.type as TaskType | undefined,
      priority: input.priority as Priority | undefined,
    });
  }

  @Tool({
    name: 'tasks_update',
    title: 'Atualizar tarefa',
    description:
      'Atualiza título, descrição, prioridade, prazo, etiquetas, critérios de aceite ou épico de uma tarefa. Respeita quem pode editar (dev: só as próprias, as que criou ou sem responsável; líder: as da equipe).',
    inputSchema: UpdateInput,
    annotations: WRITE_IDEMPOTENT,
    scopes: [SCOPES.tasksWrite],
  })
  @RequiresCap('task.edit')
  update(input: z.infer<typeof UpdateInput>, ctx: McpContext) {
    return this.tasks.update(this.actors.resolve(ctx), input.ref, { ...input.fields, priority: input.fields.priority as Priority | undefined });
  }

  @Tool({
    name: 'tasks_move',
    title: 'Mover tarefa de status',
    description:
      'Muda o status de uma tarefa (backlog, todo, in_progress, in_review, done). Ao concluir grava a data de conclusão real (doneAt); reabrir a limpa. Emite task.status_changed.v1 e, em done, task.completed.v1.',
    inputSchema: MoveInput,
    annotations: WRITE_IDEMPOTENT,
    scopes: [SCOPES.tasksWrite],
  })
  @RequiresCap('task.move')
  move(input: z.infer<typeof MoveInput>, ctx: McpContext) {
    return this.tasks.move(this.actors.resolve(ctx), input.ref, input.status as TaskStatus);
  }

  @Tool({
    name: 'tasks_assign',
    title: 'Atribuir tarefa',
    description:
      'Define o responsável de uma tarefa (membro ativo das equipes do projeto) ou remove com null. Sem a capacidade task.assign só é possível atribuir a si mesmo. Emite task.assigned.v1 e notifica a pessoa.',
    inputSchema: AssignInput,
    annotations: WRITE_IDEMPOTENT,
    scopes: [SCOPES.tasksWrite],
  })
  @RequiresCap('task.edit', 'atribuir tarefas')
  assign(input: z.infer<typeof AssignInput>, ctx: McpContext) {
    return this.tasks.assign(this.actors.resolve(ctx), input.ref, input.assignee);
  }

  @Tool({
    name: 'tasks_comment',
    title: 'Comentar tarefa',
    description: 'Adiciona um comentário a uma tarefa. Menções @Nome Sobrenome geram comment.mention.v1 e notificação.',
    inputSchema: CommentInput,
    annotations: WRITE,
    scopes: [SCOPES.tasksWrite],
  })
  @RequiresCap('task.create', 'comentar em tarefas')
  comment(input: z.infer<typeof CommentInput>, ctx: McpContext) {
    return this.tasks.comment(this.actors.resolve(ctx), input.ref, input.text);
  }

  @Tool({
    name: 'tasks_link_dependency',
    title: 'Criar dependência',
    description:
      'Registra que `ref` fica bloqueada por `blockedBy` (mesmo projeto). Recusa dependências circulares (diretas ou indiretas). Emite task.blocked.v1.',
    inputSchema: LinkInput,
    annotations: WRITE,
    scopes: [SCOPES.tasksWrite],
  })
  @RequiresCap('task.edit', 'alterar dependências de tarefas')
  link(input: z.infer<typeof LinkInput>, ctx: McpContext) {
    return this.tasks.linkDependency(this.actors.resolve(ctx), input.ref, input.blockedBy);
  }

  @Tool({
    name: 'tasks_unlink_dependency',
    title: 'Remover dependência',
    description: 'Remove a dependência de `ref` em relação a `blockedBy`.',
    inputSchema: LinkInput,
    annotations: WRITE,
    scopes: [SCOPES.tasksWrite],
  })
  @RequiresCap('task.edit', 'alterar dependências de tarefas')
  unlink(input: z.infer<typeof LinkInput>, ctx: McpContext) {
    return this.tasks.unlinkDependency(this.actors.resolve(ctx), input.ref, input.blockedBy);
  }

  @ResourceTemplate({
    uriTemplate: 'pf://tasks/{ref}',
    name: 'task',
    title: 'Tarefa',
    description: 'Detalhe JSON de uma tarefa pelo ref (ex.: pf://tasks/PCL-124), com comentários e histórico.',
    mimeType: 'application/json',
    scopes: [SCOPES.tasksRead],
  })
  @RequiresCap('task.view')
  one({ ref }: { ref: string }, ctx: McpContext) {
    return this.tasks.get(this.actors.resolve(ctx), ref);
  }

  @ResourceTemplate({
    uriTemplate: 'pf://projects/{key}/board',
    name: 'project-board',
    title: 'Quadro Kanban do projeto',
    description: 'Quadro Kanban do projeto em markdown: colunas por status, cartões com responsável, prazo, atraso e bloqueio.',
    mimeType: 'text/markdown',
    scopes: [SCOPES.tasksRead],
  })
  @RequiresCap('task.view')
  board({ key }: { key: string }, ctx: McpContext) {
    return boardMarkdown(this.tasks.board(this.actors.resolve(ctx), key));
  }
}
