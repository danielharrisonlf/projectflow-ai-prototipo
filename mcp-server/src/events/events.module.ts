import { Global, Module } from '@nestjs/common';
import { EventsService } from './events.service.js';
import { WebhooksMcp } from './webhooks.mcp.js';
import { WebhooksService } from './webhooks.service.js';

@Global()
@Module({
  providers: [EventsService, WebhooksService, WebhooksMcp],
  exports: [EventsService, WebhooksService],
})
export class EventsModule {}
