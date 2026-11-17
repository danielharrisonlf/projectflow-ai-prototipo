/* Configuração do servidor, lida do ambiente e validada com Zod na subida. */
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import * as z from 'zod';
import { ALL_SCOPES } from '../mcp/auth/scopes.js';
import { PACKAGE_ROOT, REPO_ROOT } from './paths.js';

export const APP_CONFIG = Symbol('APP_CONFIG');

const TokenGrantSchema = z.object({
  token: z.string().min(16, 'token muito curto (mínimo 16 caracteres)'),
  profile: z.string().min(1),
  userId: z.string().min(1),
  scopes: z.array(z.enum(ALL_SCOPES as [string, ...string[]])),
  /** Validade fixa (ISO 8601). Sem ela, o token vale por `ttlSeconds` a partir de cada verificação. */
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});

const TokensFileSchema = z.union([z.array(TokenGrantSchema), z.object({ tokens: z.array(TokenGrantSchema) })]);

export type TokenGrant = z.infer<typeof TokenGrantSchema>;

const csv = (value: string | undefined) =>
  value
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(3333),
  HOST: z.string().min(1).default('127.0.0.1'),
  PF_PUBLIC_URL: z.url().optional(),
  PF_AUTH_ISSUER: z.url().default('https://auth.projectflow.example'),
  PF_DATA_FILE: z.string().optional(),
  PF_SEED_FILE: z.string().optional(),
  PF_SEED_JSON: z.string().optional(),
  PF_TOKENS: z.string().optional(),
  PF_TOKENS_FILE: z.string().optional(),
  PF_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  PF_USER: z.string().min(1).default('u2'),
  PF_HISTORY_LIMIT: z.coerce.number().int().min(100).default(5000),
  PF_ALLOWED_ORIGINS: z.string().optional(),
  PF_ALLOWED_HOSTS: z.string().optional(),
  PF_CORS_ORIGINS: z.string().optional(),
});

export interface AppConfig {
  port: number;
  host: string;
  /** URL pública do servidor (sem /mcp). */
  publicUrl: string;
  /** URL canônica do endpoint MCP: o `resource` (audiência) que os tokens precisam ter. */
  resource: string;
  authIssuer: string;
  dataFile: string;
  seedFile: string;
  seedJson?: string;
  tokens: TokenGrant[];
  tokenTtlSeconds: number;
  /** Usuário do transporte stdio: id ou e-mail. */
  stdioUser: string;
  /** Máximo de registros guardados em auditoria, eventos, entregas, notificações e execuções MCP. */
  historyLimit: number;
  /** undefined = padrão do módulo (localhost); false = não checa. */
  allowedOrigins?: string[] | false;
  allowedHosts?: string[];
  corsOrigins: (string | RegExp)[];
}

function fromPackage(path: string): string {
  return isAbsolute(path) ? path : resolve(PACKAGE_ROOT, path);
}

function loadTokens(env: z.infer<typeof EnvSchema>): TokenGrant[] {
  const raw = env.PF_TOKENS ?? readTokensFile(env.PF_TOKENS_FILE);
  if (raw === undefined) return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('PF_TOKENS / arquivo de tokens não é um JSON válido.');
  }
  const parsed = TokensFileSchema.safeParse(json);
  if (!parsed.success) throw new Error(`Tokens inválidos: ${z.prettifyError(parsed.error)}`);
  return Array.isArray(parsed.data) ? parsed.data : parsed.data.tokens;
}

function readTokensFile(path: string | undefined): string | undefined {
  const file = fromPackage(path ?? 'config/tokens.demo.json');
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) throw new Error(`Configuração inválida:\n${z.prettifyError(parsed.error)}`);
  const env = parsed.data;
  const publicUrl = (env.PF_PUBLIC_URL ?? `http://localhost:${env.PORT}`).replace(/\/+$/, '');
  const origins = env.PF_ALLOWED_ORIGINS?.trim();
  return {
    port: env.PORT,
    host: env.HOST,
    publicUrl,
    resource: `${publicUrl}/mcp`,
    authIssuer: env.PF_AUTH_ISSUER,
    dataFile: fromPackage(env.PF_DATA_FILE ?? join('data', 'state.json')),
    seedFile: env.PF_SEED_FILE ? fromPackage(env.PF_SEED_FILE) : join(REPO_ROOT, 'js', 'data.js'),
    seedJson: env.PF_SEED_JSON ? fromPackage(env.PF_SEED_JSON) : undefined,
    tokens: loadTokens(env),
    tokenTtlSeconds: env.PF_TOKEN_TTL_SECONDS,
    stdioUser: env.PF_USER,
    historyLimit: env.PF_HISTORY_LIMIT,
    allowedOrigins: origins === undefined || origins === '' ? undefined : origins === 'off' ? false : csv(origins),
    allowedHosts: csv(env.PF_ALLOWED_HOSTS ?? 'localhost,127.0.0.1,[::1]'),
    corsOrigins: csv(env.PF_CORS_ORIGINS) ?? [/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/],
  };
}
