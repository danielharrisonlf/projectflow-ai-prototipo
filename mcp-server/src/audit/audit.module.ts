import { Global, Module } from '@nestjs/common';
import { AuditMcp } from './audit.mcp.js';
import { AuditService } from './audit.service.js';

@Global()
@Module({
  providers: [AuditService, AuditMcp],
  exports: [AuditService],
})
export class AuditModule {}
