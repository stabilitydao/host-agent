import { Injectable } from '@nestjs/common';
import { IDAOData, IHostAgentMemoryV3 } from '@stabilitydao/host';
import { AnalyticsService } from 'src/analytics/analytics.service';
import { GithubService } from 'src/github/github.service';
import { OnChainDataService } from 'src/on-chain-data/on-chain-data.service';
import { RevenueService } from 'src/revenue/revenue.service';
import { TelegramService } from 'src/telegram/telegram.service';
import { TwitterService } from 'src/twitter/twitter.service';
import { TxMonitoringService } from 'src/tx-sender/tx-monitoring.service';
import { getFullDaos } from 'src/utils/getDaos';
import { now } from 'src/utils/now';
import { TokenHoldersService } from '../token-holders/token-holders.service';
import { IBuildersMemoryV3 } from '@stabilitydao/host/out/api';

@Injectable()
export class MemoryV2Service {
  private daos: IDAOData[] = [];

  private startTs: number;
  constructor(
    private readonly githubService: GithubService,
    private readonly analyticsService: AnalyticsService,
    private readonly revenueService: RevenueService,
    private readonly onChainDataService: OnChainDataService,
    private readonly txMonitoring: TxMonitoringService,
    private readonly telegramService: TelegramService,
    private readonly twitterService: TwitterService,
    private readonly tokenHoldersService: TokenHoldersService,
  ) {
    this.daos = getFullDaos();
  }

  onApplicationBootstrap() {
    this.startTs = now();
  }

  getHostAgentV3Memory(): IHostAgentMemoryV3 {
    const chainTvl = this.analyticsService.getChainTvls();
    const prices = this.analyticsService.getPricesList();
    const buildersMemory = this.getBuilderMemoryV3();
    return {
      data: {
        chainTvl,
        builders: buildersMemory,
        daos: this.getDaosFullData(),
        prices,
      },
      overview: {},
      private: false,
      started: this.startTs,
      timestamp: now(),
      txSender: this.txMonitoring.spendingReport,
    };
  }

  private getBuilderMemoryV3(): IBuildersMemoryV3 {
    return this.githubService.builderMemory;
  }

  private getDaosFullData(): IHostAgentMemoryV3['data']['daos'] {
    const result: IHostAgentMemoryV3['data']['daos'] = {};
    for (const dao of this.daos) {
      const tgUsers = this.telegramService.daoUsers[dao.symbol] ?? {};
      const twitterFollowers =
        this.twitterService.twitterFollowers[dao.symbol] ?? {};
      const holders = this.tokenHoldersService.getDaoTokenHolder(dao.symbol);
      result[dao.symbol] = {
        oraclePrice: '0',
        coingeckoPrice: '0',
        holders,
        socialUsers: {
          ...tgUsers,
          ...twitterFollowers,
        },
        revenueChart: this.revenueService.getRevenueChart(dao.symbol),
        // @ts-ignore
        revenueChartV2: this.revenueService.getRevenueChartV2(dao.symbol),
        onChainData: this.onChainDataService.getOnChainData(dao.symbol),
      };
    }
    return result;
  }
}
