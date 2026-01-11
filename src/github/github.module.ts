import { Module } from '@nestjs/common';
import { GithubController } from './github.controller';
import { GithubService } from './github.service';
import { GithubCommand } from './github.command';
import { DaoModule } from 'src/dao/dao.module';
import { RevenueModule } from 'src/revenue/revenue.module';
import { OnChainDataModule } from 'src/on-chain-data/on-chain-data.module';
import { AnalyticsModule } from 'src/analytics/analytics.module';

@Module({
  controllers: [GithubController],
  imports: [DaoModule, RevenueModule, OnChainDataModule, AnalyticsModule],
  providers: [GithubService, GithubCommand],
})
export class GithubModule {}
