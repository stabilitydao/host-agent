import { Module } from '@nestjs/common';
import { GithubModule } from './github/github.module';
import { ConfigModule } from '@nestjs/config';
import { CommandModule } from 'nestjs-command';
import { ScheduleModule } from '@nestjs/schedule';
import { SubgraphModule } from './subgraph/subgraph.module';
import { DaoModule } from './dao/dao.module';
import { HttpModule } from '@nestjs/axios';
import { RevenueModule } from './revenue/revenue.module';
import { RpcModule } from './rpc/rpc.module';
import { OnChainDataModule } from './on-chain-data/on-chain-data.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ChainsModule } from './chains/chains.module';
import { MemoryModule } from './memory/memory.module';
import { TokenHoldersModule } from './token-holders/token-holders.module';
import { DaoPowerModule } from './dao-power/dao-power.module';
import { config } from './config/config';
import { TxSenderModule } from './tx-sender/tx-sender.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [config] }),
    ScheduleModule.forRoot(),
    HttpModule,
    GithubModule,
    CommandModule,
    SubgraphModule,
    ChainsModule,
    DaoModule,
    RevenueModule,
    RpcModule,
    OnChainDataModule,
    AnalyticsModule,
    MemoryModule,
    TxSenderModule,
    TokenHoldersModule,
    DaoPowerModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
