import { Injectable, Logger, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { McpExecutionContext, type McpContext, type McpContextType } from '@nestjs/mcp';
import { isInputRequiredResult } from '@modelcontextprotocol/server';
import { catchError, from, mergeMap, throwError, type Observable } from 'rxjs';
import { DomainError } from '../../domain/errors.js';
import { uid } from '../../domain/ids.js';
import { ActorResolver } from '../../identity/actor.resolver.js';
import { StateStore } from '../../state/state.store.js';

/** Argumentos como ficam no histórico: textos longos (ex.: um JSON importado) são resumidos. */
function compactArgs(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value.length > 200 ? `${value.slice(0, 80)}… (${value.length} caracteres)` : value;
  if (Array.isArray(value)) return depth > 2 ? `[${value.length} itens]` : value.slice(0, 20).map((v) => compactArgs(v, depth + 1));
  if (value && typeof value === 'object') {
    if (depth > 2) return '{…}';
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, compactArgs(v, depth + 1)]));
  }
  return value;
}

function resultText(value: unknown): string | undefined {
  const content = (value as { content?: { type: string; text?: string }[] } | undefined)?.content;
  const first = Array.isArray(content) ? content[0] : undefined;
  return first?.type === 'text' ? first.text : undefined;
}

/**
 * Log de cada chamada MCP (primitiva, usuário, transporte, duração, resultado) pelo Logger do
 * Nest — em stdio ele escreve no stderr (McpStdioLogger). Chamadas de ferramenta também entram
 * no histórico de execuções do estado (`mcpExecutions`, a aba "Execuções" do protótipo).
 */
@Injectable()
export class McpCallLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('McpCalls');

  constructor(
    private readonly actors: ActorResolver,
    private readonly store: StateStore,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType<McpContextType>() !== 'mcp') return next.handle();
    const mcp = McpExecutionContext.create(context);
    const ctx = mcp.getContext();
    const input = mcp.getInput<unknown>();
    const started = performance.now();
    return next.handle().pipe(
      mergeMap((value) => {
        const isError = (value as { isError?: boolean } | undefined)?.isError === true;
        const pending = isInputRequiredResult(value);
        const summary = pending ? 'aguardando confirmação do usuário' : isError ? (resultText(value) ?? 'erro') : 'ok';
        return from(this.finish(ctx, input, started, !isError, summary)).pipe(mergeMap(() => [value]));
      }),
      catchError((error: unknown) => {
        const summary = error instanceof DomainError ? `${error.code}: ${error.message}` : 'erro interno';
        return from(this.finish(ctx, input, started, false, summary)).pipe(mergeMap(() => throwError(() => error)));
      }),
    );
  }

  private async finish(ctx: McpContext, input: unknown, started: number, ok: boolean, summary: string): Promise<void> {
    const ms = Math.round(performance.now() - started);
    let who = 'desconhecido';
    try {
      const actor = this.actors.resolve(ctx);
      who = `${actor.user.name} (${actor.user.id}, ${actor.user.roleId})`;
    } catch {
      // sem identidade resolvível: o log registra a chamada assim mesmo
    }
    const line = `${ctx.kind} ${ctx.uri?.href ?? ctx.name} · ${who} · ${ctx.transport}/${ctx.era} · ${ms} ms · ${ok ? 'ok' : `falhou: ${summary}`}`;
    if (ok) this.logger.log(line);
    else this.logger.warn(line);
    if (ctx.kind !== 'tool') return;
    try {
      await this.store.transaction((db) => {
        db.mcpExecutions.unshift({ id: uid('mx'), ts: new Date().toISOString(), agentId: null, tool: ctx.name, args: compactArgs(input), ok, summary: summary.slice(0, 300) });
        if (db.mcpExecutions.length > 500) db.mcpExecutions.length = 500;
      });
    } catch (error) {
      this.logger.error(`Não foi possível registrar a execução de ${ctx.name}: ${(error as Error).message}`);
    }
  }
}
