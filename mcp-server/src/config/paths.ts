import { fileURLToPath } from 'node:url';

/** Raiz do pacote mcp-server (o mesmo nível vale para src/ e dist/). */
export const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Raiz do repositório do protótipo (onde ficam index.html e js/). */
export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
