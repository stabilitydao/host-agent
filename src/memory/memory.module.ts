import { Module } from '@nestjs/common';
import { MemoryV2Service } from './memory.service';
import { MemoryController } from './memory.controller';
import { RevenueModule } from '../revenue/revenue.module';
import { GithubModule } from '../github/github.module';
import { OnChainDataModule } from '../on-chain-data/on-chain-data.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { TxSenderModule } from 'src/tx-sender/tx-sender.module';
import { TelegramModule } from 'src/telegram/telegram.module';
import { TwitterModule } from 'src/twitter/twitter.module';
import { TokenHoldersModule } from 'src/token-holders/token-holders.module';

@Module({
  imports: [
    RevenueModule,
    GithubModule,
    OnChainDataModule,
    AnalyticsModule,
    TxSenderModule,
    TelegramModule,
    TwitterModule,
    TokenHoldersModule,
  ],
  providers: [MemoryV2Service],
  controllers: [MemoryController],
})
export class MemoryModule {}
