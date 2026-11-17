import { Injectable } from '@nestjs/common';
import { Resource, ResourceTemplate, Tool, type McpContext } from '@nestjs/mcp';
import { acceptedContent, inputRequired, inputResponse } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { ValidationError } from '../domain/errors.js';
import type { Priority, ProjectStatus } from '../domain/model.js';
import { ActorResolver } from '../identity/actor.resolver.js';
import { SCOPES } from '../mcp/auth/scopes.js';
import { canElicit } from '../mcp/elicitation.js';
import { RequiresCap } from '../mcp/guards/requires-cap.decorator.js';
import {
  dateOnly,
  DESTRUCTIVE,
  person,
  priority,
  ProjectDetailOut,
  ProjectListOut,
  projectRef,
  projectStatus,
  READ_ONLY,
  WRITE,
  WRITE_IDEMPOTENT,
} from '../mcp/schemas.js';
import { ProjectsService } from './projects.service.js';

const ListInput = z.object({
  status: z
    .enum(['active', 'paused', 'done', 'archived'])
    .optional()
    .describe('Filtra pela situação; "archived" lista os arquivados (exige poder arquivar ou auditar).'),
});
const GetInput = z.object({ project: projectRef });
const CreateInput = z.object({
  name: z.string().trim().min(1).max(80).describe('Nome do projeto (até 80 caracteres).'),
  key: z.string().trim().regex(/^[A-Za-z]{2,4}$/, 'de 2 a 4 letras').describe('Chave única de 2 a 4 letras, usada nos refs das tarefas (ex.: PRT gera PRT-101).'),
  description: z.string().max(2000).optional().describe('Descrição (até 2000 caracteres).'),
  priority: priority.optional(),
  startDate: dateOnly.optional().describe('Início (AAAA-MM-DD); padrão: hoje.'),
  targetDate: dateOnly.optional().describe('Entrega prevista (AAAA-MM-DD), não anterior ao início.'),
  teams: z.array(z.string().min(1)).max(10).optional().describe('Equipes do projeto (nome ou id), da sua organização.'),
  lead: person.optional().describe('Responsável pelo projeto (nome, e-mail ou id); padrão: você.'),
});
const UpdateInput = z.object({
  project: projectRef,
  fields: z
    .object({
      name: z.string().trim().min(1).max(80).optional().describe('Novo nome.'),
      description: z.string().max(2000).optional().describe('Nova descrição.'),
      priority: priority.optional(),
      status: projectStatus.optional(),
      startDate: dateOnly.nullable().optional().describe('Novo início (AAAA-MM-DD) ou null.'),
      targetDate: dateOnly.nullable().optional().describe('Nova entrega (AAAA-MM-DD) ou null.'),
      lead: person.optional().describe('Novo responsável (nome, e-mail ou id) da organização do projeto.'),
    })
    .describe('Campos a alterar; os omitidos ficam como estão.'),
});
const DeleteInput = z.object({
  project: projectRef,
  confirm: z
    .boolean()
    .optional()
    .describe('Só para clientes sem elicitação: true depois de o usuário confirmar explicitamente a exclusão. Clientes com elicitação recebem a pergunta direto.'),
});
const Confirmation = z.object({ confirm: z.boolean().describe('Confirmo a exclusão definitiva do projeto e de todas as suas tarefas.') });

/** Ferramentas e recursos de projetos: finos, delegam ao ProjectsService. */
@Injectable()
export class ProjectsMcp {
  constructor(
    private readonly projects: ProjectsService,
    private readonly actors: ActorResolver,
  ) {}

  @Tool({
    name: 'projects_list',
    title: 'Listar projetos',
    description:
      'Lista os projetos visíveis para o usuário, com situação, prioridade, % de progresso, entrega prevista, responsável e equipes. Use antes de agir para descobrir as chaves (PCL, PAG…).',
    inputSchema: ListInput,
    outputSchema: ProjectListOut,
    annotations: READ_ONLY,
    scopes: [SCOPES.projectsRead],
  })
  @RequiresCap('project.view')
  list(input: z.infer<typeof ListInput>, ctx: McpContext) {
    return this.projects.list(this.actors.resolve(ctx), { status: input.status as ProjectStatus | 'archived' | undefined });
  }

  @Tool({
    name: 'projects_get',
    title: 'Detalhar projeto',
    description:
      'Retorna um projeto pela chave ou id: descrição, datas, risco (atrasos e bloqueios), contagem de tarefas por status, épicos, marcos e sprints.',
    inputSchema: GetInput,
    outputSchema: ProjectDetailOut,
    annotations: READ_ONLY,
    scopes: [SCOPES.projectsRead],
  })
  @RequiresCap('project.view')
  get(input: z.infer<typeof GetInput>, ctx: McpContext) {
    return this.projects.get(this.actors.resolve(ctx), input.project);
  }

  @Tool({
    name: 'projects_create',
    title: 'Criar projeto',
    description:
      'Cria um projeto ativo na organização do usuário. A chave (2 a 4 letras) precisa ser única. Emite project.created.v1 e registra na auditoria. Requer o papel com project.create (Administrador ou Gestor).',
    inputSchema: CreateInput,
    annotations: WRITE,
    scopes: [SCOPES.projectsWrite],
  })
  @RequiresCap('project.create')
  create(input: z.infer<typeof CreateInput>, ctx: McpContext) {
    return this.projects.create(this.actors.resolve(ctx), { ...input, priority: input.priority as Priority | undefined });
  }

  @Tool({
    name: 'projects_update',
    title: 'Atualizar projeto',
    description:
      'Altera nome, descrição, prioridade, situação (active, paused, done), datas ou responsável de um projeto. Só grava o que mudou; emite project.updated.v1.',
    inputSchema: UpdateInput,
    annotations: WRITE_IDEMPOTENT,
    scopes: [SCOPES.projectsWrite],
  })
  @RequiresCap('project.edit')
  update(input: z.infer<typeof UpdateInput>, ctx: McpContext) {
    const { priority: prio, status, ...rest } = input.fields;
    return this.projects.update(this.actors.resolve(ctx), {
      project: input.project,
      fields: { ...rest, ...(prio && { priority: prio as Priority }), ...(status && { status: status as ProjectStatus }) },
    });
  }

  @Tool({
    name: 'projects_archive',
    title: 'Arquivar projeto',
    description: 'Arquiva um projeto: ele sai das listagens ativas (pode ser restaurado com projects_unarchive). Emite project.archived.v1.',
    inputSchema: GetInput,
    annotations: WRITE_IDEMPOTENT,
    scopes: [SCOPES.projectsWrite],
  })
  @RequiresCap('project.archive')
  archive(input: z.infer<typeof GetInput>, ctx: McpContext) {
    return this.projects.archive(this.actors.resolve(ctx), input.project);
  }

  @Tool({
    name: 'projects_unarchive',
    title: 'Desarquivar projeto',
    description: 'Restaura um projeto arquivado às listagens ativas. Emite project.unarchived.v1.',
    inputSchema: GetInput,
    annotations: WRITE_IDEMPOTENT,
    scopes: [SCOPES.projectsWrite],
  })
  @RequiresCap('project.archive', 'desarquivar projetos')
  unarchive(input: z.infer<typeof GetInput>, ctx: McpContext) {
    return this.projects.unarchive(this.actors.resolve(ctx), input.project);
  }

  @Tool({
    name: 'projects_delete',
    title: 'Excluir projeto',
    description:
      'Exclui DEFINITIVAMENTE um projeto com tarefas, sprints, épicos, marcos e comentários. Irreversível: o servidor pede confirmação ao usuário (elicitação) ou, em clientes sem elicitação, exige confirm: true depois de você confirmar com o usuário. Só o Administrador (project.delete).',
    inputSchema: DeleteInput,
    annotations: DESTRUCTIVE,
    scopes: [SCOPES.projectsWrite, SCOPES.admin],
  })
  @RequiresCap('project.delete')
  async delete(input: z.infer<typeof DeleteInput>, ctx: McpContext) {
    const actor = this.actors.resolve(ctx);
    // confere escopo e existência antes de perguntar: não se pede confirmação do que não se pode excluir
    const preview = await this.projects.previewDelete(actor, input.project);
    const what = `${preview.key} — ${preview.name} (${preview.tasks} tarefas, ${preview.sprints} sprints)`;
    if (canElicit(ctx)) {
      const responses = ctx.server.mcpReq.inputResponses;
      const answer = inputResponse(responses, 'confirm');
      if (answer.kind === 'missing') {
        return inputRequired({
          inputRequests: {
            confirm: inputRequired.elicit({ message: `Excluir definitivamente o projeto ${what}? Esta ação não pode ser desfeita.`, requestedSchema: Confirmation }),
          },
        });
      }
      if (acceptedContent(responses, 'confirm', Confirmation)?.confirm !== true) {
        return `Exclusão de ${preview.key} cancelada pelo usuário; nada foi alterado.`;
      }
    } else if (input.confirm !== true) {
      throw new ValidationError(
        `A exclusão de ${what} é irreversível. Confirme com o usuário e chame de novo com confirm: true.`,
      );
    }
    return this.projects.delete(actor, input.project);
  }

  @Resource({
    uri: 'pf://projects',
    name: 'projects',
    title: 'Projetos visíveis',
    description: 'Lista JSON dos projetos ativos visíveis para o usuário (mesmo conteúdo de projects_list).',
    mimeType: 'application/json',
    scopes: [SCOPES.projectsRead],
  })
  @RequiresCap('project.view')
  all(_input: unknown, ctx: McpContext) {
    return this.projects.list(this.actors.resolve(ctx));
  }

  @ResourceTemplate({
    uriTemplate: 'pf://projects/{key}',
    name: 'project',
    title: 'Projeto',
    description: 'Detalhe JSON de um projeto pela chave (ex.: pf://projects/PCL).',
    mimeType: 'application/json',
    scopes: [SCOPES.projectsRead],
  })
  @RequiresCap('project.view')
  one({ key }: { key: string }, ctx: McpContext) {
    return this.projects.get(this.actors.resolve(ctx), key);
  }
}
