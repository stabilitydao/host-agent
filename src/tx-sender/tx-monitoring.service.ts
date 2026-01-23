import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { promises as fs } from 'fs';
import { join } from 'path';
import {
  ChainReport,
  TransactionReport,
  TransactionResult,
} from './tx-sender.types';
import { RpcService } from 'src/rpc/rpc.service';
import { ChainsService } from 'src/chains/chains.service';
import { IHostAgentMemory } from '@stabilitydao/host';
import { formatUnits } from 'viem';
import { now } from 'src/utils/now';
import { AnalyticsService } from 'src/analytics/analytics.service';

@Injectable()
export class TxMonitoringService implements OnModuleInit {
  spendingReport?: IHostAgentMemory['txSender'];

  private readonly logger = new Logger(TxMonitoringService.name);
  private readonly reportsDir = join(process.cwd(), 'temp/tx-reports');
  private readonly dailyReportsDir = join(this.reportsDir, 'daily');

  private lastTxTs = 0;

  private chainReports: Map<string, ChainReport> = new Map();

  constructor(
    private readonly rpcService: RpcService,
    private readonly chains: ChainsService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  async onModuleInit() {
    await this.ensureDirectories();
    await this.loadExistingReports();
    await this.initializeSpendingReport();

    const account = this.rpcService.getAccountAddress();
    this.logger.log(`Account: ${account}`);

    const chains = this.chains.getChains();
    this.logger.log(`Chains: ${chains.map((c) => c.name).join(', ')}`);
  }

  async recordSuccess(
    chainId: string,
    txType: string,
    txId: string,
    hash: string,
    gasSpent: string,
  ) {
    const report: TransactionReport = {
      hash,
      chainId,
      type: txType,
      id: txId,
      gasSpent,
      timestamp: new Date(),
      status: TransactionResult.SUCCESS,
    };

    await this.addReport(chainId, report);
    this.logger.log(
      `[${chainId}] Recorded successful tx ${txType}-${txId} | Gas: ${gasSpent} ETH | Hash: ${hash}`,
    );

    this.updateSpendingReport(chainId, gasSpent);
  }

  async recordFailure(
    chainId: string,
    txType: string,
    txId: string,
    errorMessage: string,
    gasSpent: string,
    status: TransactionResult,
  ) {
    const report: TransactionReport = {
      hash: 'N/A',
      chainId,
      type: txType,
      id: txId,
      gasSpent,
      timestamp: new Date(),
      status,
      errorMessage,
    };

    await this.addReport(chainId, report);
    this.logger.warn(
      `[${chainId}] Recorded failed tx ${txType}-${txId} | Error: ${errorMessage}`,
    );
    this.updateSpendingReport(chainId, gasSpent);
  }

  private async addReport(chainId: string, report: TransactionReport) {
    let chainReport = this.chainReports.get(chainId);

    if (!chainReport) {
      chainReport = {
        chainId,
        totalTransactions: 0,
        successfulTransactions: 0,
        failedTransactions: 0,
        totalGasSpent: '0',
        lastUpdated: new Date(),
        transactions: [],
      };
      this.chainReports.set(chainId, chainReport);
    }

    chainReport.transactions.push(report);
    chainReport.totalTransactions++;
    chainReport.lastUpdated = new Date();

    if (report.status === 'success') {
      chainReport.successfulTransactions++;
      chainReport.totalGasSpent = this.addGasValues(
        chainReport.totalGasSpent,
        report.gasSpent,
      );
    } else {
      chainReport.failedTransactions++;
    }

    await this.saveChainReport(chainId, chainReport);
  }

  private async saveChainReport(chainId: string, report: ChainReport) {
    const filename = join(this.reportsDir, `chain-${chainId}.json`);

    try {
      await fs.writeFile(filename, JSON.stringify(report, null, 2), 'utf-8');
    } catch (error) {
      this.logger.error(`Failed to save report for chain ${chainId}:`, error);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateDailySummary() {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0];

    for (const [chainId, report] of this.chainReports.entries()) {
      const dailyFilename = join(
        this.dailyReportsDir,
        `chain-${chainId}-${dateStr}.json`,
      );

      try {
        await fs.writeFile(
          dailyFilename,
          JSON.stringify(report, null, 2),
          'utf-8',
        );

        this.logger.log(
          `[${chainId}] Daily summary saved: ${report.totalTransactions} txs, ` +
            `${report.successfulTransactions} success, ` +
            `${report.failedTransactions} failed, ` +
            `Gas: ${report.totalGasSpent} ETH`,
        );

        report.transactions = [];
        report.totalTransactions = 0;
        report.successfulTransactions = 0;
        report.failedTransactions = 0;
        report.totalGasSpent = '0';
      } catch (error) {
        this.logger.error(
          `Failed to save daily summary for chain ${chainId}:`,
          error,
        );
      }
    }
  }

  getChainReport(chainId: string): ChainReport | null {
    return this.chainReports.get(chainId) || null;
  }

  getAllReports(): ChainReport[] {
    return Array.from(this.chainReports.values());
  }

  getSummaryStats() {
    const allReports = this.getAllReports();

    return {
      totalChains: allReports.length,
      totalTransactions: allReports.reduce(
        (sum, r) => sum + r.totalTransactions,
        0,
      ),
      successfulTransactions: allReports.reduce(
        (sum, r) => sum + r.successfulTransactions,
        0,
      ),
      failedTransactions: allReports.reduce(
        (sum, r) => sum + r.failedTransactions,
        0,
      ),
      totalGasSpent: allReports.reduce(
        (sum, r) => this.addGasValues(sum, r.totalGasSpent),
        '0',
      ),
      chains: allReports.map((r) => ({
        chainId: r.chainId,
        transactions: r.totalTransactions,
        gasSpent: r.totalGasSpent,
      })),
    };
  }

  @Cron(CronExpression.EVERY_HOUR)
  logStats() {
    const stats = this.getSummaryStats();

    this.logger.log(
      `=== Transaction Statistics ===\n` +
        `Total Chains: ${stats.totalChains}\n` +
        `Total Transactions: ${stats.totalTransactions}\n` +
        `Successful: ${stats.successfulTransactions}\n` +
        `Failed: ${stats.failedTransactions}\n` +
        `Total Gas Spent: ${stats.totalGasSpent} ETH\n` +
        `==============================`,
    );

    for (const chain of stats.chains) {
      if (chain.transactions > 0) {
        this.logger.log(
          `[Chain ${chain.chainId}] Txs: ${chain.transactions}, Gas: ${chain.gasSpent} ETH`,
        );
      }
    }
  }

  private async ensureDirectories() {
    try {
      await fs.mkdir(this.reportsDir, { recursive: true });
      await fs.mkdir(this.dailyReportsDir, { recursive: true });
      this.logger.log('Report directories initialized');
    } catch (error) {
      this.logger.error('Failed to create report directories:', error);
    }
  }

  private async initializeSpendingReport() {
    const accountAddress = this.rpcService.getAccountAddress();

    if (!accountAddress) {
      this.logger.warn('No account address found');
      return;
    }

    this.spendingReport = {
      account: accountAddress,
      balance: {},
      spent: {},
    };
    const chains = this.chains.getChains();
    for (const chain of chains) {
      const client = this.rpcService.getPublicClient(chain.chainId.toString());
      if (!client) {
        continue;
      }
      const balance = await client.getBalance({
        address: accountAddress,
      });

      this.spendingReport.balance[chain.chainId] = {
        coin: formatUnits(balance, 18),
        usd: 0,
      };
    }
  }

  private async updateSpendingReport(chainId: string, gasSpent: string) {
    if (!this.spendingReport) {
      return;
    }
    const nativePrice = this.analyticsService.getNativePriceForChain(chainId);

    const usdSpent = nativePrice * Number(gasSpent);

    if (!usdSpent) {
      return;
    }

    const lastReport = this.spendingReport.spent[this.lastTxTs] ?? {
      txs: 0,
      usd: {},
    };

    const txs = lastReport.txs + 1;
    const usd = (lastReport.usd[chainId] ?? 0) + usdSpent;

    const newReport = {
      txs,
      usd: {
        ...lastReport.usd,
        [chainId]: usd,
      },
    };

    this.spendingReport.spent[now()] = newReport;
    this.lastTxTs = now();
  }

  private async loadExistingReports() {
    try {
      const files = await fs.readdir(this.reportsDir);
      const chainFiles = files.filter(
        (f) => f.startsWith('chain-') && f.endsWith('.json'),
      );

      for (const file of chainFiles) {
        const content = await fs.readFile(join(this.reportsDir, file), 'utf-8');
        const report: ChainReport = JSON.parse(content);
        this.chainReports.set(report.chainId, report);
      }

      this.logger.log(`Loaded ${chainFiles.length} existing chain reports`);
    } catch (error) {
      this.logger.warn('No existing reports found or failed to load:', error);
    }
  }

  private addGasValues(a: string, b: string): string {
    const aNum = parseFloat(a) || 0;
    const bNum = parseFloat(b) || 0;
    return (aNum + bNum).toFixed(18);
  }

  async exportToCSV(chainId: string): Promise<string | null> {
    const report = this.chainReports.get(chainId);
    if (!report) return null;

    const csv = [
      'Timestamp,Type,ID,Hash,Status,Gas Spent (ETH),Retries,Error',
      ...report.transactions.map((tx) =>
        [
          tx.timestamp.toISOString(),
          tx.type,
          tx.id,
          tx.hash,
          tx.status,
          tx.gasSpent,
          tx.retries || 0,
          tx.errorMessage || '',
        ].join(','),
      ),
    ].join('\n');

    const filename = join(this.reportsDir, `chain-${chainId}.csv`);
    await fs.writeFile(filename, csv, 'utf-8');

    return filename;
  }
}
