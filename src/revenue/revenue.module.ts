import { Module } from '@nestjs/common';
import { RevenueService } from './revenue.service';
import { DaoModule } from '../dao/dao.module';
import { RevenuePeriodUpdaterService } from './revenue-period-updater.service';
import { TxSenderModule } from '../tx-sender/tx-sender.module';

@Module({
  providers: [RevenueService, RevenuePeriodUpdaterService],
  imports: [DaoModule, TxSenderModule],
  exports: [RevenueService],
})
export class RevenueModule {}
