import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RpcService } from 'src/rpc/rpc.service';
import {
  formatUnits,
  PublicClient,
  WalletClient,
  WriteContractParameters,
} from 'viem';
import { TxQueue } from './tx-sender.queu';
import { SentTransactionResult, Transaction } from './tx-sender.types';

@Injectable()
export class TxSenderService {
  private readonly logger = new Logger(TxSenderService.name);

  private readonly queue: TxQueue = new TxQueue();
  private isProcessing = false;
  constructor(private readonly rpcService: RpcService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    await this.processQueue();
  }
  addTxToQueue(tx: Transaction) {
    this.logger.log(`[${tx.chainId}] Adding tx to queue ${tx.type}-${tx.id}`);
    this.queue.add(tx);
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.logger.log(`Processing queue with ${this.queue.size()} txs`);

    const tx = this.queue.peek();
    if (!tx) return;

    this.isProcessing = true;
    await this.processSingleTx(tx);
    this.isProcessing = false;
  }

  private async processSingleTx(tx: Transaction) {
    let success = false;
    try {
      const publicClient = this.rpcService.getPublicClient(tx.chainId);
      if (!publicClient) {
        this.logger.warn(`[${tx.chainId}] No client found`);
        return;
      }
      const sim = await this.simulateTx(tx, publicClient);

      if (!sim) return;

      this.logger.log(`[${tx.chainId}] Sending tx ${tx.type}-${tx.id}`);

      const walletClient = this.rpcService.getWalletClient(tx.chainId);

      if (!walletClient) {
        this.logger.warn(`[${tx.chainId}] No wallet client found`);
        return;
      }

      const result = await this.sendTx(tx, sim, publicClient, walletClient);

      if (!result) return;

      success = true;
    } catch (e) {
      this.logger.error(e);
      this.logger.error(
        `[${tx.chainId}] Failed to process tx ${tx.type}-${tx.id}`,
      );
    } finally {
      if (success) this.queue.remove();
      else {
        if (tx.retries <= 0) this.queue.remove();
        else {
          this.logger.log(
            `[${tx.chainId}] Moving tx to the end of queue ${tx.type}-${tx.id}`,
          );
          this.queue.moveToEnd(tx.id);
        }
      }
    }
  }

  private async simulateTx(
    tx: Transaction,
    client: PublicClient,
  ): Promise<WriteContractParameters | null> {
    this.logger.log(`[${tx.chainId}] Simulating tx ${tx.type}-${tx.id}`);
    try {
      const sim = await client.simulateContract(tx.data);
      this.logger.log(
        `[${tx.chainId}] Simulated tx successfully ${tx.type}-${tx.id}`,
      );

      return sim.request as WriteContractParameters;
    } catch (e) {
      this.logger.warn(
        `[${tx.chainId}] Failed to simulate tx ${tx.type}-${tx.id}`,
      );

      tx.retries -= 1;
      return null;
    }
  }

  private async sendTx(
    tx: Transaction,
    params: WriteContractParameters,
    publicClient: PublicClient,
    client: WalletClient,
  ): Promise<SentTransactionResult | null> {
    this.logger.log(`[${tx.chainId}] Sending tx ${tx.type}-${tx.id}`);
    try {
      const hash = await client.writeContract(params);

      const transaction = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 180_000,
      });

      const spent = formatUnits(
        BigInt(transaction.gasUsed) * transaction.effectiveGasPrice,
        18,
      );

      return {
        hash,
        spent,
      };
    } catch (e) {
      this.logger.error(
        `[${tx.chainId}] Failed to send tx ${tx.type}-${tx.id}`,
      );

      tx.retries = 0;
      return null;
    }
  }
}
