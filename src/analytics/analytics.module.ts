import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { ChainDataProviderModule } from 'src/chain-data-provider/chain-data-provider.module';
import { AnalyticsController } from './analytics.controller';

@Module({
  imports: [ChainDataProviderModule],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
