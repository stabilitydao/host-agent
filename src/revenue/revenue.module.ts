import { Module } from '@nestjs/common';
import { RevenueService } from './revenue.service';
import { DaoModule } from '../dao/dao.module';
import { TxSenderModule } from 'src/tx-sender/tx-sender.module';
import { RevenuePeriodUpdaterService } from './revenue-period-updater.service';

@Module({
  providers: [RevenueService, RevenuePeriodUpdaterService],
  imports: [DaoModule, TxSenderModule],
  exports: [RevenueService],
})
export class RevenueModule {}
