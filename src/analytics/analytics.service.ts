import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DefiLlamaService } from 'src/chain-data-provider/defilama.service';
import { DexscreenerService } from 'src/chain-data-provider/dexscreener.service';
import { Analytics } from './types/analytics';
import { analyticsAssets } from './config/analytics-config';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class AnalyticsService implements OnModuleInit {
  private analytics: Analytics;
  private logger = new Logger(AnalyticsService.name);
  constructor(
    private readonly dexScreenerService: DexscreenerService,
    private readonly defiLlamaService: DefiLlamaService,
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
