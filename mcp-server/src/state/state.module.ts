import { Global, Module } from '@nestjs/common';
import { FileStateRepository } from './file-state.repository.js';
import { SeedProvider } from './seed.provider.js';
import { StateRepository } from './state.repository.js';
import { StateStore } from './state.store.js';

@Global()
@Module({
  providers: [SeedProvider, StateStore, { provide: StateRepository, useClass: FileStateRepository }],
  exports: [StateStore, SeedProvider],
})
export class StateModule {}
