import { randomBytes } from 'node:crypto';

/** Identificador curto com prefixo, no mesmo estilo de PF.uid (`tsk` + 7 caracteres base36). */
export function uid(prefix = 'id'): string {
  const n = randomBytes(6).readUIntBE(0, 6);
  return prefix + n.toString(36).padStart(7, '0').slice(-7);
}
