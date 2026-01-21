import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { daos } from '@stabilitydao/host';
import { ContractIndices, IDAOData } from '@stabilitydao/host/out/host';
import RevenueRouterABI from 'abi/RevenueRouterABI';
import { TxSenderService } from 'src/tx-sender/tx-sender.service';
import { TransactionType } from 'src/tx-sender/tx-sender.types';
import { v4 } from 'uuid';
import { Abi } from 'viem';

@Injectable()
export class RevenuePeriodUpdaterService {
  private updatePeriodFunctionName = 'updatePeriod';
  constructor(private readonly txSenderService: TxSenderService) {}

  @Cron(CronExpression.EVERY_MINUTE)
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
        },
        id,
        retries: 3,
      });
    }
  }
}
