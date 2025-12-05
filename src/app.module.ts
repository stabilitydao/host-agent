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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    HttpModule,
    GithubModule,
    CommandModule,
    SubgraphModule,
    DaoModule,
    RevenueModule,
    RpcModule,
    OnChainDataModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
