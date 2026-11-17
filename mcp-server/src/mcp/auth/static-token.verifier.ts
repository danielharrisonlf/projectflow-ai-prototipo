import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { McpTokenVerifier } from '@nestjs/mcp';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { APP_CONFIG, type AppConfig, type TokenGrant } from '../../config/app-config.js';

const digest = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Verificador de tokens da DEMONSTRAÇÃO: tokens estáticos por perfil (config/tokens.demo.json
 * ou PF_TOKENS), cada um mapeado para um usuário do estado e um conjunto de scopes.
 *
 * Em produção, troque por um verificador de JWT do seu provedor de identidade (por exemplo o
 * JwtVerifier de @nestjs/authentication contra o JWKS do emissor): ele devolve o mesmo AuthInfo,
 * com `extra.userId` vindo de um claim (sub) — nada mais muda no servidor.
 */
@Injectable()
export class StaticTokenVerifier implements McpTokenVerifier {
  private readonly logger = new Logger('StaticTokenVerifier');
  private readonly grants: Map<string, TokenGrant>;
  private readonly resource: URL;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    // indexado pelo hash: a busca não compara o token em texto puro caractere a caractere
    this.grants = new Map(config.tokens.map((g) => [digest(g.token), g]));
    this.resource = new URL(config.resource);
    if (!this.grants.size) this.logger.warn('Nenhum token configurado: o endpoint HTTP vai recusar todas as requisições (401).');
  }

  verifyAccessToken(token: string): AuthInfo | null {
    const grant = this.grants.get(digest(token));
    if (!grant) return null;
    const expiresAt = grant.expiresAt
      ? Math.floor(Date.parse(grant.expiresAt) / 1000)
      : Math.floor(Date.now() / 1000) + this.config.tokenTtlSeconds;
    return {
      token,
      clientId: `projectflow-demo:${grant.profile}`,
      scopes: [...grant.scopes],
      expiresAt,
      resource: this.resource,
      extra: { userId: grant.userId, profile: grant.profile },
    };
  }
}
