import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { daos } from '@stabilitydao/stability';
import { RevenueChart } from '@stabilitydao/stability/out/api.types';
import { DaoFactory } from 'src/dao/dao-factory';

@Injectable()
export class RevenueService implements OnModuleInit {
  public revenueCharts: { [daoSymbol: string]: RevenueChart } = {};
  private logger = new Logger(RevenueService.name);
  constructor(private readonly daoFactory: DaoFactory) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleUpdateRevenueChart() {
    await this.updateRevenueChart();
  }

  async onModuleInit() {
    await this.updateRevenueChart();
  }

  getRevenueChart(daoSymbol: string) {
    return this.revenueCharts[daoSymbol];
  }

  private async updateRevenueChart() {
    for (const dao of daos) {
      try {
        const daoService = this.daoFactory.create(dao);
        if (!daoService) {
          this.revenueCharts[dao.symbol] = {};
          continue;
        }

        const revenueChart = await daoService.getRevenueChart();

        this.revenueCharts[dao.symbol] = revenueChart;
      } catch (e) {
        this.logger.warn(e.message);
        if (!e.message) {
          this.logger.error(e);
        }
      } finally {
        continue;
      }
    }
  }
}
