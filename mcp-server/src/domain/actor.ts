import type { AuditSource, User } from './model.js';

/** Quem executa a operação e por qual canal (a origem vai para a auditoria). */
export interface Actor {
  user: User;
  source: AuditSource;
}
