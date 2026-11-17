import { defineConfig } from 'vitest/config';
import base from './vitest.config.js';

/** E2E: HTTP real (app.listen(0)) e stdio real (processo filho sobre dist/stdio.js, compilado no globalSetup). */
export default defineConfig({
  oxc: base.oxc,
  test: {
    name: 'mcp-server-e2e',
    globals: true,
    setupFiles: ['reflect-metadata'],
    include: ['test/e2e/**/*.e2e-spec.ts'],
    globalSetup: ['test/support/build.global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
