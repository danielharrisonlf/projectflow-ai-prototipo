import { Global, Module } from '@nestjs/common';
import { ActorResolver } from './actor.resolver.js';
import { IdentityMcp } from './identity.mcp.js';

@Global()
@Module({
  providers: [ActorResolver, IdentityMcp],
  exports: [ActorResolver],
})
export class IdentityModule {}
