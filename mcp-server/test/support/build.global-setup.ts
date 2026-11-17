import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** O e2e de stdio executa o build real (dist/stdio.js): compila antes da suíte. */
export default function setup(): void {
  execFileSync(process.execPath, ['scripts/clean.mjs'], { cwd: root, stdio: 'inherit' });
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'], { cwd: root, stdio: 'inherit' });
}
