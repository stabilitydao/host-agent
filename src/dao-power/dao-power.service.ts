import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { daos, IDAOData } from '@stabilitydao/host';
import { ContractIndices } from '@stabilitydao/host/out/host';
import IDAO from 'abi/IDAO';
import { ChainsService } from 'src/chains/chains.service';
import { RpcService } from 'src/rpc/rpc.service';
import { TokenHoldersService } from 'src/token-holders/token-holders.service';
import { TxSenderService } from 'src/tx-sender/tx-sender.service';
import { TransactionType } from 'src/tx-sender/tx-sender.types';
import { Abi } from 'viem';

@Injectable()
export class DaoPowerService {
  constructor(
    private readonly tokenHoldersService: TokenHoldersService,
    private readonly chainService: ChainsService,
    private readonly rpcService: RpcService,
    private readonly txSenderService: TxSenderService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron() {
    for (const dao of daos) {
      await this.updatePowersForDao(dao);
    }
  }

  private async updatePowersForDao(dao: IDAOData) {
    const holders = this.tokenHoldersService.getTokenHoldersForDao(dao.symbol);

    const initialChain = this.chainService.getChainByName(dao.initialChain);
    const initialDaoToken =
      dao.deployments?.[initialChain.chainId]?.[ContractIndices.DAO_TOKEN_5];

    if (!initialDaoToken) {
      return;
    }

    const powers: Record<string, bigint> = {};

    for (const chainId in holders) {
      if (chainId == initialChain.chainId) {
        continue;
      }

      const deployments = dao.deployments[chainId];

      const daoToken = deployments?.[ContractIndices.DAO_TOKEN_5];

      const client = this.rpcService.getPublicClient(chainId);

      if (!client) {
        continue;
      }

      for (const holder of holders[chainId]) {
        const power = (await client.readContract({
          address: daoToken as `0x${string}`,
          abi: IDAO as Abi,
          functionName: 'getPowers',
          args: [holder.address],
        })) as [bigint, bigint];

        powers[holder.address] = (powers[holder.address] ?? 0n) + power[0];
      }

      if (Object.keys(powers).length == 0) {
        continue;
      }
    }
    this.sendUpdateTx(
      initialDaoToken as `0x${string}`,
      initialChain.chainId + '',
      powers,
    );
  }

  private sendUpdateTx(
    tokenAddress: `0x${string}`,
    chainId: string,
    powers: Record<string, bigint>,
  ) {
    const args = Object.entries(powers).reduce<[string[], bigint[]]>(
      (acc, [address, power]) => {
        acc[0].push(address);
        acc[1].push(power);
        return acc;
      },
      [[], []],
    );

    this.txSenderService.addTxToQueue({
      chainId,
      id: this.txSenderService.generateTxId(),
      retries: 3,
      type: TransactionType.UPDATE_OTHER_CHAINS_POWERS,
      data: {
        abi: IDAO as Abi,
        address: tokenAddress,
        functionName: 'updateOtherChainsPowers',
        account: this.rpcService.getAccount(),
        args,
      },
    });
  }
}
