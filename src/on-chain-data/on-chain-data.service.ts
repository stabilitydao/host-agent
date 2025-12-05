import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { daos } from '@stabilitydao/stability';
import { DaoFactory } from 'src/dao/dao-factory';
import { OnChainData } from 'src/dao/types/dao';

@Injectable()
export class OnChainDataService {
  public onChainData: {
    [daoSymbol: string]: OnChainData;
  } = {};
  private logger = new Logger(OnChainDataService.name);
  constructor(private readonly daoFactory: DaoFactory) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleUpdateOnChainData() {
    await this.updateOnChainData();
  }

  async onModuleInit() {
    await this.updateOnChainData();
  }

  getOnChainData(daoSymbol: string) {
    return this.onChainData[daoSymbol];
  }

  private async updateOnChainData() {
    for (const dao of daos) {
      try {
        const daoService = this.daoFactory.create(dao);
        if (!daoService) {
          this.onChainData[dao.symbol] = {};
          continue;
        }
        const onChainData = await daoService.getOnchainData();

        this.onChainData[dao.symbol] = onChainData;
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
