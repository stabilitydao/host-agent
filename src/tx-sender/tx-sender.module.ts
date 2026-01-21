import { Module } from '@nestjs/common';
import { TxSenderService } from './tx-sender.service';
import { TxMonitoringService } from './tx-monitoring.service';

@Module({
  providers: [TxSenderService, TxMonitoringService],
  exports: [TxSenderService],
})
export class TxSenderModule {}
