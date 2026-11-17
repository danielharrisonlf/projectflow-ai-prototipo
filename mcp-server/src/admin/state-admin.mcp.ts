import { Injectable } from '@nestjs/common';
import { Tool, type McpContext } from '@nestjs/mcp';
import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { ActorResolver } from '../identity/actor.resolver.js';
import { SCOPES } from '../mcp/auth/scopes.js';
import { RequiresCap } from '../mcp/guards/requires-cap.decorator.js';
import { DESTRUCTIVE, READ_ONLY } from '../mcp/schemas.js';
import { StateAdminService } from './state-admin.service.js';

const ImportInput = z.object({
  content: z
    .string()
    .min(2)
    .max(3_500_000)
    .describe('O JSON completo exportado pelo protótipo (Configurações → "Exportar estado (JSON)") ou por state_export.'),
  confirm: z.literal(true).describe('true: substitui TODO o estado atual pelo importado (o usuário precisa ter pedido isso).'),
});
const ResetInput = z.object({
  confirm: z.literal(true).describe('true: descarta o estado atual e volta ao cenário inicial da demonstração.'),
});

/** Administração do estado: exportar, importar e restaurar (só Administrador, scope admin). */
@Injectable()
export class StateAdminMcp {
  constructor(
    private readonly admin: StateAdminService,
    private readonly actors: ActorResolver,
  ) {}

  @Tool({
    name: 'state_export',
    title: 'Exportar estado',
    description:
      'Exporta todo o estado em JSON, no mesmo formato do "Exportar estado (JSON)" do protótipo (localStorage projectflow.db.v1). O JSON vem como recurso embutido.',
    annotations: READ_ONLY,
    scopes: [SCOPES.admin],
  })
  @RequiresCap('user.manage', 'exportar o estado')
  async export(_input: unknown, ctx: McpContext): Promise<CallToolResult> {
    const { json, counts } = await this.admin.export(this.actors.resolve(ctx));
    const summary = Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', ');
    return {
      content: [
        { type: 'text', text: `Estado exportado (${summary}).` },
        { type: 'resource', resource: { uri: 'pf://state/export.json', mimeType: 'application/json', text: json } },
      ],
    };
  }

  @Tool({
    name: 'state_import',
    title: 'Importar estado',
    description:
      'Substitui todo o estado pelo JSON exportado do protótipo, para o agente operar sobre os dados do usuário. Valida formato e versão do seed, migra e saneia; o usuário que importa precisa existir no JSON.',
    inputSchema: ImportInput,
    annotations: DESTRUCTIVE,
    scopes: [SCOPES.admin],
  })
  @RequiresCap('user.manage', 'importar o estado')
  import(input: z.infer<typeof ImportInput>, ctx: McpContext) {
    return this.admin.import(this.actors.resolve(ctx), input.content, {
      signal: ctx.signal,
      onProgress: (done, total, message) => ctx.reportProgress(done, total, message),
    });
  }

  @Tool({
    name: 'state_reset',
    title: 'Restaurar dados de demonstração',
    description: 'Descarta o estado atual e recria o cenário inicial a partir do seed do protótipo (js/data.js).',
    inputSchema: ResetInput,
    annotations: DESTRUCTIVE,
    scopes: [SCOPES.admin],
  })
  @RequiresCap('user.manage', 'restaurar os dados de demonstração')
  reset(_input: z.infer<typeof ResetInput>, ctx: McpContext) {
    return this.admin.reset(this.actors.resolve(ctx), {
      signal: ctx.signal,
      onProgress: (done, total, message) => ctx.reportProgress(done, total, message),
    });
  }
}
