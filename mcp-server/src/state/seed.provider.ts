/* Seed do estado inicial. Fonte única da verdade: o seed determinístico do protótipo
   (js/data.js), executado com node:vm num sandbox com um `window` falso — nenhum dado é copiado.

   Fallback, nesta ordem, se o data.js não puder ser executado:
   1. PF_SEED_JSON: um JSON exportado do protótipo (Configurações → "Exportar estado (JSON)");
   2. estado mínimo: uma organização, os cinco papéis e um administrador, sem projetos. */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { SCHEMA_VERSION } from '../domain/constants.js';
import { nowIso } from '../domain/dates.js';
import type { Db } from '../domain/model.js';
import { normalizeState } from '../domain/state-shape.js';

export type SeedSource = 'prototype' | 'json' | 'minimal';

export interface Seed {
  db: Db;
  source: SeedSource;
  /** Versão do seed do protótipo (`PFSeed.VERSION`); null no fallback mínimo. */
  version: number | null;
}

interface PrototypeSeed {
  build: () => unknown;
  VERSION: number;
}

/** Executa o data.js do protótipo e devolve `window.PFSeed`. */
export function loadPrototypeSeed(file: string): PrototypeSeed {
  const code = readFileSync(file, 'utf8');
  const sandbox: { window: Record<string, unknown> } = { window: {} };
  createContext(sandbox);
  runInContext(code, sandbox, { filename: file, timeout: 5000 });
  const seed = sandbox.window.PFSeed as PrototypeSeed | undefined;
  if (!seed || typeof seed.build !== 'function' || typeof seed.VERSION !== 'number') {
    throw new Error(`${file} não definiu window.PFSeed { build, VERSION }`);
  }
  return seed;
}

export function minimalState(): Db {
  const now = nowIso();
  return {
    meta: { seedVersion: 0, seededAt: now, schema: SCHEMA_VERSION, fallback: true },
    settings: { currentUserId: 'u1', currentProjectId: null },
    orgs: [{ id: 'org-default', name: 'Organização', slug: 'organizacao' }],
    roles: [
      { id: 'admin', name: 'Administrador da organização' },
      { id: 'pm', name: 'Gestor de projetos' },
      { id: 'lead', name: 'Líder de equipe' },
      { id: 'dev', name: 'Desenvolvedor / Colaborador' },
      { id: 'viewer', name: 'Visualizador / Auditor' },
    ],
    users: [
      { id: 'u1', name: 'Administrador', email: 'admin@projectflow.local', roleId: 'admin', orgId: 'org-default', teamIds: [], active: true },
    ],
    teams: [],
    projects: [],
    epics: [],
    sprints: [],
    milestones: [],
    tasks: [],
    comments: [],
    audit: [],
    events: [],
    webhooks: [],
    deliveries: [],
    notifications: [],
    notifTemplates: [],
    notifPrefs: {},
    providers: {},
    mcpTools: [],
    mcpAgents: [],
    mcpExecutions: [],
    taskCounters: {},
  };
}

@Injectable()
export class SeedProvider {
  private readonly logger = new Logger('Seed');
  private prototype: PrototypeSeed | null | undefined;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** Versão do seed do protótipo, para recusar estados de outra versão; null se indisponível. */
  version(): number | null {
    return this.prototypeSeed()?.VERSION ?? null;
  }

  build(): Seed {
    const proto = this.prototypeSeed();
    if (proto) {
      // JSON ida e volta: tira os objetos do realm do sandbox (outros protótipos de Array/Object)
      const result = normalizeState(JSON.parse(JSON.stringify(proto.build())), proto.VERSION);
      if (result.ok) return { db: result.db, source: 'prototype', version: proto.VERSION };
      this.logger.warn(`Seed do protótipo recusado: ${result.reason}`);
    }
    if (this.config.seedJson) {
      try {
        const result = normalizeState(JSON.parse(readFileSync(this.config.seedJson, 'utf8')), null);
        if (result.ok) return { db: result.db, source: 'json', version: result.db.meta.seedVersion };
        this.logger.warn(`PF_SEED_JSON recusado: ${result.reason}`);
      } catch (error) {
        this.logger.warn(`PF_SEED_JSON não pôde ser lido: ${(error as Error).message}`);
      }
    }
    this.logger.warn('Usando o estado mínimo (sem projetos): o seed do protótipo não está disponível.');
    return { db: minimalState(), source: 'minimal', version: null };
  }

  private prototypeSeed(): PrototypeSeed | null {
    if (this.prototype !== undefined) return this.prototype;
    try {
      this.prototype = loadPrototypeSeed(this.config.seedFile);
    } catch (error) {
      this.logger.warn(`Não foi possível executar ${this.config.seedFile}: ${(error as Error).message}`);
      this.prototype = null;
    }
    return this.prototype;
  }
}
