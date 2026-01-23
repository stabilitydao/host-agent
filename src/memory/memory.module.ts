import { Module } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { MemoryController } from './memory.controller';
import { RevenueModule } from '../revenue/revenue.module';
import { GithubModule } from '../github/github.module';
import { OnChainDataModule } from '../on-chain-data/on-chain-data.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { MemoryV2Service } from './memory-v2.service';
import { TxSenderModule } from 'src/tx-sender/tx-sender.module';

@Module({
  imports: [
    RevenueModule,
    GithubModule,
    OnChainDataModule,
    AnalyticsModule,
    TxSenderModule,
  ],
  providers: [MemoryService, MemoryV2Service],
  controllers: [MemoryController],
})
export class MemoryModule {}
