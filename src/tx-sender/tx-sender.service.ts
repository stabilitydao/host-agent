import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RpcService } from 'src/rpc/rpc.service';
import { v4 } from 'uuid';
import {
  formatUnits,
  PublicClient,
  WalletClient,
  WriteContractParameters,
} from 'viem';
import { TxMonitoringService } from './tx-monitoring.service';
import { TxQueue } from './tx-sender.queu';
import {
  SentTransactionResult,
  Transaction,
  TransactionResult,
} from './tx-sender.types';

@Injectable()
export class TxSenderService {
  private readonly logger = new Logger(TxSenderService.name);

  private readonly queue: TxQueue = new TxQueue();
  private isProcessing = false;
  constructor(
    private readonly rpcService: RpcService,
    private readonly monitoring: TxMonitoringService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    await this.processQueue();
  }
  addTxToQueue(tx: Transaction) {
    this.logger.log(`[${tx.chainId}] Adding tx to queue ${tx.type}-${tx.id}`);
    this.queue.add(tx);
  }

  generateTxId() {
    return v4();
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
    const result: SentTransactionResult = {
      status: TransactionResult.UNKNOWN,
      hash: 'N/A',
      spent: '0',
    };

    try {
      const publicClient = this.rpcService.getPublicClient(tx.chainId);
      if (!publicClient) {
        this.logger.warn(`[${tx.chainId}] No client found`);
        return;
      }
      const sim = await this.simulateTx(tx, publicClient);

      if (!sim) {
        result.status = TransactionResult.SIMULATION_FAILED;
        return;
      }

      this.logger.log(`[${tx.chainId}] Sending tx ${tx.type}-${tx.id}`);

      const walletClient = this.rpcService.getWalletClient(tx.chainId);

      if (!walletClient) {
        this.logger.warn(`[${tx.chainId}] No wallet client found`);
        return;
      }

      const sendTxResult = await this.sendTx(
        tx,
        sim,
        publicClient,
        walletClient,
      ).catch((e) => {
        result.status = TransactionResult.SENDING_ERROR;
        result.error = e.message;
      });

      if (sendTxResult) {
        result.spent = sendTxResult.spent;
        result.hash = sendTxResult.hash;
        result.status = sendTxResult.status;
      }
    } catch (e) {
      this.logger.error(e);
      this.logger.error(
        `[${tx.chainId}] Failed to process tx ${tx.type}-${tx.id}`,
      );
    } finally {
      this.sendReport(tx, result);
    }
  }

  private sendReport(tx: Transaction, result: SentTransactionResult) {
    switch (result.status) {
      case TransactionResult.SUCCESS:
        this.logger.log(
          `[${tx.chainId}] Recorded successful tx ${tx.type}-${tx.id} | Gas: ${result.spent} | Hash: ${result.hash}`,
        );
        this.queue.remove();
        this.monitoring.recordSuccess(
          tx.chainId,
          tx.type,
          tx.id,
          result.hash,
          result.spent,
        );
        break;

      case TransactionResult.REVERTED:
        this.queue.remove();
        this.logger.error(
          `[${tx.chainId}] Reverted tx ${tx.type}-${tx.id}. Hash: ${result.hash}`,
        );
        this.monitoring.recordFailure(
          tx.chainId,
          tx.type,
          tx.id,
          result.hash,
          result.spent,
          TransactionResult.REVERTED,
        );
        break;

      case TransactionResult.SENDING_ERROR:
        this.handleTxRetry(tx);
        this.logger.error(
          `[${tx.chainId}] Failed to send tx ${tx.type}-${tx.id}. Error ${result.error}`,
        );

        this.monitoring.recordFailure(
          tx.chainId,
          tx.type,
          tx.id,
          result.hash,
          result.spent,
          TransactionResult.SENDING_ERROR,
        );
        break;

      case TransactionResult.SIMULATION_FAILED:
        this.handleTxRetry(tx);
        this.logger.error(
          `[${tx.chainId}] Failed to simulate tx ${tx.type}-${tx.id}`,
        );
        this.monitoring.recordFailure(
          tx.chainId,
          tx.type,
          tx.id,
          result.hash,
          result.spent,
          TransactionResult.SIMULATION_FAILED,
        );
        break;
      default:
        break;
    }
  }

  private async simulateTx(
    tx: Transaction,
    client: PublicClient,
  ): Promise<WriteContractParameters | null> {
    this.logger.log(`[${tx.chainId}] Simulating tx ${tx.type}-${tx.id}`);
    try {
      const sim = await client.simulateContract({
        ...tx.data,
      });
      this.logger.log(
        `[${tx.chainId}] Simulated tx successfully ${tx.type}-${tx.id}`,
      );

      return sim.request as WriteContractParameters;
    } catch (e) {
      this.logger.log(e);
      return null;
    }
  }

  private handleTxRetry(tx: Transaction) {
    tx.retries -= 1;
    if (tx.retries > 0) {
      this.queue.moveToEnd(tx.id);
    } else {
      this.queue.remove();
    }
  }

  private async sendTx(
    tx: Transaction,
    params: WriteContractParameters,
    publicClient: PublicClient,
    client: WalletClient,
  ): Promise<SentTransactionResult> {
    const hash = await client.writeContract({
      ...params,
    });

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
      status:
        transaction.status === 'reverted'
          ? TransactionResult.REVERTED
          : TransactionResult.SUCCESS,
    };
  }
}
