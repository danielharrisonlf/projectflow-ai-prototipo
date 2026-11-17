import { Module } from '@nestjs/common';
import { StaticTokenVerifier } from './static-token.verifier.js';

/** Provê o verificador de tokens às opções do McpModule (forRootAsync). */
@Module({
  providers: [StaticTokenVerifier],
  exports: [StaticTokenVerifier],
})
export class McpAuthModule {}
