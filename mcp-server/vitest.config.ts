import { defineConfig } from 'vitest/config';

/** Testes unitários (services e regras) e de integração (cliente MCP em memória). */
export default defineConfig({
  // Decorators legados com metadata emitida, como no repositório do @nestjs/mcp: a injeção de
  // dependências do Nest lê os tipos dos construtores (design:paramtypes).
  oxc: {
    decorator: { legacy: true, emitDecoratorMetadata: true },
    assumptions: { setPublicClassFields: true },
    typescript: { removeClassFieldsWithoutInitializer: true },
  },
  test: {
    name: 'mcp-server',
    globals: true,
    setupFiles: ['reflect-metadata'],
    include: ['test/unit/**/*.spec.ts', 'test/integration/**/*.spec.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
