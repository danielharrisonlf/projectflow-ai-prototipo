import { Module } from '@nestjs/common';
import { StateAdminMcp } from './state-admin.mcp.js';
import { StateAdminService } from './state-admin.service.js';

@Module({
  providers: [StateAdminService, StateAdminMcp],
})
export class AdminModule {}
