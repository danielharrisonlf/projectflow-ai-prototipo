import { Injectable } from '@nestjs/common';
import { ResourceTemplate, Tool, type McpContext } from '@nestjs/mcp';
import * as z from 'zod';
import type { SprintStatus } from '../domain/model.js';
import { ActorResolver } from '../identity/actor.resolver.js';
import { SCOPES } from '../mcp/auth/scopes.js';
import { RequiresCap } from '../mcp/guards/requires-cap.decorator.js';
import { dateOnly, projectRef, READ_ONLY, SprintListOut, sprintRef, taskRef, WRITE } from '../mcp/schemas.js';
import { SprintsService } from './sprints.service.js';

const ListInput = z.object({
  project: projectRef.optional(),
  status: z.enum(['planned', 'active', 'done']).optional().describe('planned, active ou done.'),
});
const CreateInput = z.object({
  project: projectRef,
  name: z.string().trim().min(1).max(40).describe('Nome único no projeto (ex.: "Sprint 17").'),
  goal: z.string().max(300).optional().describe('Meta da sprint.'),
  startDate: dateOnly.describe('Início (AAAA-MM-DD).'),
  endDate: dateOnly.describe('Término (AAAA-MM-DD), depois do início.'),
});
const SprintInput = z.object({ sprint: sprintRef, project: projectRef.optional().describe('Projeto, quando a sprint é informada pelo nome.') });
const AssignInput = z.object({
  sprint: sprintRef.nullable().describe('Sprint de destino (id ou nome) ou null para devolver as tarefas ao backlog.'),
  project: projectRef.optional().describe('Projeto, quando a sprint é informada pelo nome.'),
  refs: z.array(taskRef).min(1).max(100).describe('Tarefas a associar (até 100), do mesmo projeto da sprint.'),
});

/** Ferramentas e recursos de sprints: finos, delegam ao SprintsService. */
@Injectable()
export class SprintsMcp {
  constructor(
    private readonly sprints: SprintsService,
    private readonly actors: ActorResolver,
  ) {}

  @Tool({
    name: 'sprints_list',
    title: 'Listar sprints',
    description: 'Lista sprints dos projetos visíveis (ou de um projeto) com situação, meta, datas e progresso (tarefas concluídas / total).',
    inputSchema: ListInput,
    outputSchema: SprintListOut,
    annotations: READ_ONLY,
    scopes: [SCOPES.projectsRead],
  })
  @RequiresCap('sprint.view')
  list(input: z.infer<typeof ListInput>, ctx: McpContext) {
    return this.sprints.list(this.actors.resolve(ctx), { project: input.project, status: input.status as SprintStatus | undefined });
  }

  @Tool({
    name: 'sprints_create',
    title: 'Planejar sprint',
    description: 'Cria uma sprint planejada em um projeto. O nome precisa ser único no projeto e o término depois do início.',
    inputSchema: CreateInput,
    annotations: WRITE,
    scopes: [SCOPES.sprintsWrite],
  })
  @RequiresCap('sprint.manage', 'criar sprints')
  create(input: z.infer<typeof CreateInput>, ctx: McpContext) {
    return this.sprints.create(this.actors.resolve(ctx), input);
  }

  @Tool({
    name: 'sprints_start',
    title: 'Iniciar sprint',
    description: 'Inicia uma sprint planejada. Só pode haver uma sprint ativa por projeto: encerre a atual antes. Emite sprint.started.v1.',
    inputSchema: SprintInput,
    annotations: WRITE,
    scopes: [SCOPES.sprintsWrite],
  })
  @RequiresCap('sprint.manage', 'iniciar sprints')
  start(input: z.infer<typeof SprintInput>, ctx: McpContext) {
    return this.sprints.start(this.actors.resolve(ctx), input.sprint, input.project);
  }

  @Tool({
    name: 'sprints_close',
    title: 'Encerrar sprint',
    description: 'Encerra a sprint ativa. As tarefas não concluídas voltam ao backlog (ficam sem sprint). Emite sprint.completed.v1.',
    inputSchema: SprintInput,
    annotations: WRITE,
    scopes: [SCOPES.sprintsWrite],
  })
  @RequiresCap('sprint.manage', 'encerrar sprints')
  close(input: z.infer<typeof SprintInput>, ctx: McpContext) {
    return this.sprints.close(this.actors.resolve(ctx), input.sprint, input.project);
  }

  @Tool({
    name: 'sprints_assign_tasks',
    title: 'Associar tarefas à sprint',
    description:
      'Associa um lote de tarefas a uma sprint planejada ou ativa (ou devolve ao backlog com sprint null). Processa uma a uma, informa progresso e o resultado por tarefa; falhas individuais não interrompem o lote e o cancelamento do cliente o interrompe.',
    inputSchema: AssignInput,
    annotations: { ...WRITE, idempotentHint: true },
    scopes: [SCOPES.sprintsWrite, SCOPES.tasksWrite],
  })
  @RequiresCap('sprint.manage', 'associar tarefas a sprints')
  assign(input: z.infer<typeof AssignInput>, ctx: McpContext) {
    return this.sprints.assignTasks(
      this.actors.resolve(ctx),
      { sprint: input.sprint, project: input.project, refs: input.refs },
      { signal: ctx.signal, onProgress: (done, total, message) => ctx.reportProgress(done, total, message) },
    );
  }

  @ResourceTemplate({
    uriTemplate: 'pf://sprints/{id}',
    name: 'sprint',
    title: 'Sprint',
    description: 'Sprint pelo id (ex.: pf://sprints/sp-pcl-15) com progresso e as tarefas associadas.',
    mimeType: 'application/json',
    scopes: [SCOPES.projectsRead],
  })
  @RequiresCap('sprint.view')
  one({ id }: { id: string }, ctx: McpContext) {
    return this.sprints.get(this.actors.resolve(ctx), id);
  }
}
