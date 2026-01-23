import { Module } from '@nestjs/common';
import { TxSenderService } from './tx-sender.service';
import { TxMonitoringService } from './tx-monitoring.service';
import { AnalyticsModule } from 'src/analytics/analytics.module';

@Module({
  imports: [AnalyticsModule],
  providers: [TxSenderService, TxMonitoringService],
  exports: [TxSenderService, TxMonitoringService],
})
export class TxSenderModule {}
