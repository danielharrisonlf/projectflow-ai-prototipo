import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from './app-config.js';

/** Configuração validada, disponível para toda a aplicação (testes substituem APP_CONFIG). */
@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig(process.env) }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
