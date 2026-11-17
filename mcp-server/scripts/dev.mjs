// Desenvolvimento: tsc em modo watch + node --watch reiniciando o HTTP a cada build.
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tsc = 'node_modules/typescript/bin/tsc';
const run = (args) => spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });

spawnSync(process.execPath, ['scripts/clean.mjs'], { cwd: root, stdio: 'inherit' });
const first = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], { cwd: root, stdio: 'inherit' });
if (first.status !== 0) process.exit(first.status ?? 1);

const children = [
  run([tsc, '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput']),
  run(['--watch-path=dist', '--enable-source-maps', 'dist/main.js']),
];
const stop = () => children.forEach((c) => c.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
