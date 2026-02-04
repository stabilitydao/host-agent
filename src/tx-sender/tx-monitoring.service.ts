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
import { AnalyticsService } from 'src/analytics/analytics.service';

@Injectable()
export class TxMonitoringService implements OnModuleInit {
  spendingReport?: IHostAgentMemory['txSender'];

  private readonly logger = new Logger(TxMonitoringService.name);
  private readonly reportsDir = join(process.cwd(), 'temp/tx-reports');
  private readonly dailyReportsDir = join(this.reportsDir, 'daily');

  private chainReports: Map<string, ChainReport> = new Map();
  private dailyReports: Map<string, Map<string, ChainReport>> = new Map(); // date -> chainId -> report

  constructor(
    private readonly rpcService: RpcService,
    private readonly chains: ChainsService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  async onModuleInit() {
    await this.ensureDirectories();
    await this.loadExistingReports();
    await this.loadAllDailyReports();
    await this.initializeSpendingReport();

    const account = this.rpcService.getAccountAddress();
    this.logger.log(`Account: ${account}`);

    const chains = this.chains.getChains();
    this.logger.log(`Chains: ${chains.map((c) => c.name).join(', ')}`);
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

  @Cron(CronExpression.EVERY_8_HOURS)
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

        // Store in memory before resetting
        if (!this.dailyReports.has(dateStr)) {
          this.dailyReports.set(dateStr, new Map());
        }
        this.dailyReports.get(dateStr)!.set(chainId, { ...report });

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

  /**
   * Load all daily reports from the daily reports directory
   * Populates the dailyReports Map with historical data
   */
  async loadAllDailyReports(): Promise<void> {
    try {
      const files = await fs.readdir(this.dailyReportsDir);
      const dailyFiles = files.filter(
        (f) => f.startsWith('chain-') && f.endsWith('.json'),
      );

      for (const file of dailyFiles) {
        try {
          // Parse filename: chain-{chainId}-{date}.json
          const match = file.match(/^chain-(.+)-(\d{4}-\d{2}-\d{2})\.json$/);
          if (!match) {
            this.logger.warn(`Invalid daily report filename: ${file}`);
            continue;
          }

          const [, chainId, dateStr] = match;
          const content = await fs.readFile(
            join(this.dailyReportsDir, file),
            'utf-8',
          );
          const report: ChainReport = JSON.parse(content);

          // Initialize date map if it doesn't exist
          if (!this.dailyReports.has(dateStr)) {
            this.dailyReports.set(dateStr, new Map());
          }

          // Store the report
          this.dailyReports.get(dateStr)!.set(chainId, report);
        } catch (error) {
          this.logger.error(`Failed to parse daily report ${file}:`, error);
        }
      }

      const totalDates = this.dailyReports.size;
      const totalReports = Array.from(this.dailyReports.values()).reduce(
        (sum, dateMap) => sum + dateMap.size,
        0,
      );

      this.logger.log(
        `Loaded ${totalReports} daily reports across ${totalDates} dates`,
      );
    } catch (error) {
      this.logger.warn('No daily reports found or failed to load:', error);
    }
  }

  /**
   * Get daily report for a specific chain and date
   */
  getDailyReport(chainId: string, date: string): ChainReport | null {
    const dateReports = this.dailyReports.get(date);
    if (!dateReports) return null;
    return dateReports.get(chainId) || null;
  }

  getDailyReportsByDate(date: string): Map<string, ChainReport> | null {
    return this.dailyReports.get(date) || null;
  }

  getDailyReportsByChain(chainId: string): Map<string, ChainReport> {
    const chainDailyReports = new Map<string, ChainReport>();

    for (const [date, dateReports] of this.dailyReports.entries()) {
      const report = dateReports.get(chainId);
      if (report) {
        chainDailyReports.set(date, report);
      }
    }

    return chainDailyReports;
  }

  getAvailableDates(): string[] {
    return Array.from(this.dailyReports.keys()).sort();
  }

  getSpentData(): NonNullable<IHostAgentMemory['txSender']>['spent'] {
    const spent = {};

    for (const [date, dateReports] of this.dailyReports.entries()) {
      if (!spent[date]) {
        spent[date] = {
          txs: 0,
          usd: {},
        };
      }

      for (const [chainId, report] of dateReports.entries()) {
        const assetPrice =
          this.analyticsService.getNativePriceForChain(chainId);

        if (!spent[date].usd[chainId]) {
          spent[date].usd[chainId] = 0;
        }

        spent[date].txs += report.totalTransactions;
        spent[date].usd[chainId] += assetPrice * Number(report.totalGasSpent);
      }
    }

    const chainIds = this.chains.getChains();

    for (const { chainId } of chainIds) {
      const reports = this.getAllReports().filter((r) => r.chainId == chainId);

      for (const { lastUpdated, totalTransactions, totalGasSpent } of reports) {
        const date = new Date(lastUpdated).toISOString().split('T')[0];
        if (!spent[date]) {
          spent[date] = {
            txs: 0,
            usd: {},
          };
        }
        const usd = spent[date].usd;

        const assetPrice = this.analyticsService.getNativePriceForChain(
          chainId.toString(),
        );

        if (!usd[chainId]) usd[chainId] = 0;
        spent[date].txs += totalTransactions;
        spent[date].usd[chainId] += assetPrice * Number(totalGasSpent);
      }
    }

    return spent;
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

    if (!this.spendingReport) {
      this.spendingReport = {
        account: accountAddress,
        balance: {},
        spent: {},
      };
    }

    this.spendingReport.balance = await this.getBalances(accountAddress);
    this.spendingReport.spent = this.getSpentData();
  }

  private async getBalances(
    accountAddress: `0x${string}`,
  ): Promise<NonNullable<IHostAgentMemory['txSender']>['balance']> {
    const chains = this.chains.getChains();
    const balance = {};
    for (const chain of chains) {
      const client = this.rpcService.getPublicClient(chain.chainId.toString());
      if (!client) {
        continue;
      }
      const accountBalance = await client
        .getBalance({
          address: accountAddress,
        })
        .catch(() => 0n);

      this.logger.log(
        `[${chain.chainId}] Balance: ${formatUnits(accountBalance, 18)}`,
      );

      const assetPrice = this.analyticsService.getNativePriceForChain(
        chain.chainId.toString(),
      );

      const coin = formatUnits(accountBalance, 18);
      const usd = assetPrice * Number(coin);

      balance[chain.chainId] = {
        coin,
        usd,
      };
    }

    return balance;
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

    const date = new Date().toISOString().split('T')[0];

    const lastReport = this.spendingReport.spent[date] ?? {
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

    this.spendingReport.spent[date] = newReport;
  }

  private async loadExistingReports() {
    try {
      const files = await fs.readdir(this.reportsDir);
      const chainFiles = files.filter(
        (f) =>
          f.startsWith('chain-') && f.endsWith('.json') && !f.includes('-2'),
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
