import { Module } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { MemoryController } from './memory.controller';
import { RevenueModule } from 'src/revenue/revenue.module';
import { GithubModule } from 'src/github/github.module';
import { OnChainDataModule } from 'src/on-chain-data/on-chain-data.module';
import { AnalyticsModule } from 'src/analytics/analytics.module';

@Module({
  imports: [RevenueModule, GithubModule, OnChainDataModule, AnalyticsModule],
  providers: [MemoryService],
  controllers: [MemoryController],
})
export class MemoryModule {}
