import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { McpExecutionContext, type McpContextType } from '@nestjs/mcp';
import { ProtocolError, ProtocolErrorCode, ResourceNotFoundError, type CallToolResult } from '@modelcontextprotocol/server';
import { DomainError } from '../../domain/errors.js';

const TITLES: Record<DomainError['code'], string> = {
  not_found: 'Não encontrado',
  invalid_args: 'Argumentos inválidos',
  permission_denied: 'Permissão negada',
  conflict: 'Conflito',
  unauthenticated: 'Não autenticado',
};

/**
 * Traduz erros de domínio para o agente, sem stack: em ferramentas, um resultado com
 * `isError: true` (o modelo lê a mensagem e pode corrigir a chamada); em recursos e prompts,
 * o erro JSON-RPC adequado. Outros erros seguem para o módulo, que responde
 * "Internal server error" e registra o detalhe no log.
 */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): CallToolResult {
    if (host.getType<McpContextType>() !== 'mcp') throw error;
    const ctx = McpExecutionContext.create(host).getContext();
    const text = `${TITLES[error.code]} [${error.code}]: ${error.message}`;
    if (ctx.kind === 'tool') {
      return { content: [{ type: 'text', text }], isError: true, _meta: { 'projectflow/error': error.code } };
    }
    if (error.code === 'not_found' && ctx.kind === 'resource' && ctx.uri) {
      throw new ResourceNotFoundError(ctx.uri.href, text);
    }
    const code = error.code === 'not_found' || error.code === 'invalid_args' ? ProtocolErrorCode.InvalidParams : ProtocolErrorCode.InvalidRequest;
    throw new ProtocolError(code, text, { error: error.code });
  }
}
