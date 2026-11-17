import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../../src/config/app-config.js';
import { REPO_ROOT } from '../../src/config/paths.js';
import { ValidationError } from '../../src/domain/errors.js';
import { StaticTokenVerifier } from '../../src/mcp/auth/static-token.verifier.js';
import { FileStateRepository } from '../../src/state/file-state.repository.js';
import { loadPrototypeSeed, SeedProvider } from '../../src/state/seed.provider.js';
import { StateStore } from '../../src/state/state.store.js';
import { tempState, TOKENS } from '../support/fixtures.js';
import { createServices } from '../support/services.js';

describe('seed do protótipo via node:vm', () => {
  it('executa js/data.js sem copiar dados e devolve o cenário da demonstração', () => {
    const seed = loadPrototypeSeed(join(REPO_ROOT, 'js', 'data.js'));
    const db = seed.build() as { projects: { key: string }[]; users: unknown[] };
    expect(seed.VERSION).toBeGreaterThan(0);
    expect(db.projects.map((p) => p.key)).toContain('PCL');
    expect(db.users).toHaveLength(18);
  });

  it('cai para o estado mínimo quando o data.js não existe', () => {
    const provider = new SeedProvider(loadConfig({ PF_TOKENS: '[]', PF_SEED_FILE: 'nao-existe/data.js' }));
    const seed = provider.build();
    expect(seed.source).toBe('minimal');
    expect(seed.db.users[0]).toMatchObject({ roleId: 'admin' });
  });
});

describe('FileStateRepository + StateStore', () => {
  let tmp: ReturnType<typeof tempState>;

  beforeEach(() => {
    tmp = tempState();
  });

  afterEach(() => tmp.cleanup());

  async function boot() {
    const config = loadConfig({ PF_TOKENS: '[]', PF_DATA_FILE: tmp.file });
    const store = new StateStore(new FileStateRepository(config), new SeedProvider(config));
    await store.onModuleInit();
    return store;
  }

  it('cria o arquivo a partir do seed e recarrega o que foi gravado', async () => {
    const store = await boot();
    expect(store.source).toBe('prototype');
    await store.transaction((db) => {
      db.projects[0]!.name = 'Renomeado';
    });
    const again = await boot();
    expect(again.source).toBe('file');
    expect(again.read((db) => db.projects[0]!.name)).toBe('Renomeado');
    // escrita atômica: nenhum .tmp sobra no diretório
    expect(readdirSync(tmp.dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('transação que falha não altera o estado', async () => {
    const store = await boot();
    const before = readFileSync(tmp.file, 'utf8');
    await expect(
      store.transaction((db) => {
        db.projects = [];
        throw new ValidationError('falhou no meio');
      }),
    ).rejects.toThrow('falhou no meio');
    expect(store.read((db) => db.projects.length)).toBeGreaterThan(0);
    expect(readFileSync(tmp.file, 'utf8')).toBe(before);
  });

  it('arquivo corrompido é guardado como .invalid-*.json e o seed recriado', async () => {
    writeFileSync(tmp.file, '{ isto não é json');
    const store = await boot();
    expect(store.source).toBe('prototype');
    expect(readdirSync(tmp.dir).some((f) => f.includes('.invalid-'))).toBe(true);
    expect(existsSync(tmp.file)).toBe(true);
  });
});

describe('StateAdminService (importar/exportar o JSON do protótipo)', () => {
  it('exporta e reimporta o mesmo formato; recusa JSON inválido e não-admin', async () => {
    const s = await createServices();
    const admin = s.actor('u1');
    const { json } = await s.admin.export(admin);
    const exported = JSON.parse(json);
    exported.projects[0].name = 'Importado';
    const steps: string[] = [];
    const result = await s.admin.import(admin, JSON.stringify(exported), { onProgress: (_d, _t, m) => void steps.push(m) });
    expect(result.imported).toBe(true);
    expect(steps).toHaveLength(4);
    expect(s.db().projects[0]!.name).toBe('Importado');
    expect(s.db().audit[0]).toMatchObject({ action: 'import', source: 'mcp' });
    await expect(s.admin.import(admin, '{"meta":{}}')).rejects.toThrow(/Estado recusado/);
    await expect(s.admin.import(admin, 'não é json')).rejects.toThrow(/JSON válido/);
    await expect(s.admin.export(s.actor('u2'))).rejects.toThrow(/não pode exportar o estado/);
    await s.moduleRef.close();
  });
});

describe('StaticTokenVerifier', () => {
  const config = loadConfig({});

  it('mapeia token → usuário, scopes, resource e expiração futura', () => {
    const info = new StaticTokenVerifier(config).verifyAccessToken(TOKENS.dev)!;
    expect(info).toMatchObject({ clientId: 'projectflow-demo:dev', scopes: ['projects:read', 'tasks:read', 'tasks:write'], extra: { userId: 'u8' } });
    expect(info.resource?.href).toBe('http://localhost:3333/mcp');
    expect(info.expiresAt!).toBeGreaterThan(Date.now() / 1000);
  });

  it('recusa token desconhecido', () => {
    expect(new StaticTokenVerifier(config).verifyAccessToken('pf-demo-inexistente-000000')).toBeNull();
  });

  it('valida a configuração de tokens com zod', () => {
    expect(() => loadConfig({ PF_TOKENS: '[{"token":"curto","profile":"x","userId":"u1","scopes":[]}]' })).toThrow(/Tokens inválidos/);
    expect(() => loadConfig({ PF_TOKENS: '[{"token":"pf-token-suficientemente-longo","profile":"x","userId":"u1","scopes":["tudo"]}]' })).toThrow(/Tokens inválidos/);
  });
});
