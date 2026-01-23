import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DefiLlamaService } from '../chain-data-provider/defilama.service';
import { DexscreenerService } from '../chain-data-provider/dexscreener.service';
import { Analytics } from './types/analytics';
import { analyticsAssets } from './config/analytics-config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ChainsService } from 'src/chains/chains.service';

@Injectable()
export class AnalyticsService implements OnModuleInit {
  private analytics: Analytics;
  private logger = new Logger(AnalyticsService.name);
  constructor(
    private readonly dexScreenerService: DexscreenerService,
    private readonly defiLlamaService: DefiLlamaService,
    private readonly chainsService: ChainsService,
  ) {}

  async onModuleInit() {
    try {
      await this.updateAnalytics();
    } catch (e) {
      this.logger.warn(`Failed to get analytics data: ${e.message}`);
      this.analytics = {
        chainTvls: {},
        prices: {},
      };
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async updateAnalyticsData() {
    try {
      await this.updateAnalytics();
    } catch (e) {
      this.logger.warn(`Failed to get analytics data: ${e.message}`);
    }
  }

  getAnalytics(): Analytics {
    return this.analytics;
  }

  getNativePriceForChain(chainId: string): number {
    const chain = this.chainsService.getViemChainById(chainId);
    const symbol = chain?.nativeCurrency.symbol;

    if (!symbol) {
      return 0;
    }
    const prices = this.analytics.prices[symbol];

    const price = this.analytics.prices[symbol];
    if (!prices) {
      return 0;
    }
    return +price.priceUsd;
  }

  private async updateAnalytics() {
    const tvlsMap = await this.defiLlamaService.getChainTvls();

    const assetPrices = await Promise.all(
      analyticsAssets.map(async (asset) => {
        return [
          asset.symbol,
          await this.dexScreenerService.getPair(asset.network, asset.address),
        ];
      }),
    );

    this.analytics = {
      chainTvls: Object.fromEntries(tvlsMap),
      prices: Object.fromEntries(assetPrices),
    };
  }
}
