import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { daos } from '@stabilitydao/host';
import { ContractIndices, IDAOData } from '@stabilitydao/host/out/host';
import RevenueRouterABI from 'abi/RevenueRouterABI';
import { TxSenderService } from 'src/tx-sender/tx-sender.service';
import { TransactionType } from 'src/tx-sender/tx-sender.types';
import { v4 } from 'uuid';
import { Abi } from 'viem';

const CRON_EXPRESSION = '0 0 * * 4';

@Injectable()
export class RevenuePeriodUpdaterService {
  private updatePeriodFunctionName = 'updatePeriod';
  constructor(private readonly txSenderService: TxSenderService) {}

  async onModuleInit() {
    await this.updatePeriods();
  }

  @Cron(CRON_EXPRESSION, { timeZone: 'UTC' })
  async handleCron() {
    await this.updatePeriods();
  }

  private async updatePeriods() {
    for (const dao of daos) {
      await this.updatePeriodForDao(dao);
    }
  }

  private async updatePeriodForDao(dao: IDAOData) {
    for (const chainId in dao.deployments) {
      const deployments = dao.deployments[chainId];

      const revenueRouterAddress =
        deployments[ContractIndices.REVENUE_ROUTER_21];

      if (!revenueRouterAddress) {
        continue;
      }

      const id = v4();
      this.txSenderService.addTxToQueue({
        chainId,
        type: TransactionType.UPDATE_PERIOD,
        data: {
          address: revenueRouterAddress,
          abi: RevenueRouterABI as Abi,
          functionName: this.updatePeriodFunctionName,
          args: [],
        },
        id,
        retries: 3,
      });
    }
  }
}
