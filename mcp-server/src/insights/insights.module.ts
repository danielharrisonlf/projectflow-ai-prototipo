import { Module } from '@nestjs/common';
import { InsightsMcp } from './insights.mcp.js';
import { InsightsService } from './insights.service.js';

@Module({
  providers: [InsightsService, InsightsMcp],
  exports: [InsightsService],
})
export class InsightsModule {}
