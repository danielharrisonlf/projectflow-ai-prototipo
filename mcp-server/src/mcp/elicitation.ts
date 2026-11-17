import type { McpContext } from '@nestjs/mcp';
import { CLIENT_CAPABILITIES_META_KEY } from '@modelcontextprotocol/server';

/**
 * A confirmação por elicitação (`inputRequired`) vale para clientes da revisão 2026-07-28 que
 * declaram a capacidade `elicitation`. Clientes 2025 (ou sem a capacidade) confirmam com um
 * argumento explícito — no HTTP sem sessão um cliente 2025 não pode ser consultado no meio da chamada.
 */
export function canElicit(ctx: McpContext): boolean {
  if (ctx.era !== 'modern') return false;
  const envelope = ctx.server.mcpReq.envelope as Record<string, unknown> | undefined;
  const capabilities = envelope?.[CLIENT_CAPABILITIES_META_KEY] as { elicitation?: unknown } | undefined;
  return capabilities?.elicitation != null;
}
