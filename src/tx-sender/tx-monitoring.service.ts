import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ChainReport, TransactionReport } from './tx-sender.types';

@Injectable()
export class TxMonitoringService implements OnModuleInit {
  private readonly logger = new Logger(TxMonitoringService.name);
  private readonly reportsDir = join(process.cwd(), 'tx-reports');
  private readonly dailyReportsDir = join(this.reportsDir, 'daily');

  // In-memory cache for current reports
  private chainReports: Map<number, ChainReport> = new Map();

  async onModuleInit() {
    await this.ensureDirectories();
    await this.loadExistingReports();
  }

  /**
   * Record a successful transaction
   */
  async recordSuccess(
    chainId: number,
    txType: string,
    txId: string,
    hash: string,
    gasSpent: string,
    retries?: number,
  ) {
    const report: TransactionReport = {
      hash,
      chainId,
      type: txType,
      id: txId,
      gasSpent,
      timestamp: new Date(),
      status: 'success',
      retries,
    };

    await this.addReport(chainId, report);
    this.logger.log(
      `[${chainId}] Recorded successful tx ${txType}-${txId} | Gas: ${gasSpent} ETH | Hash: ${hash}`,
    );
  }

  /**
   * Record a failed transaction
   */
  async recordFailure(
    chainId: number,
    txType: string,
    txId: string,
    errorMessage: string,
    retries?: number,
  ) {
    const report: TransactionReport = {
      hash: 'N/A',
      chainId,
      type: txType,
      id: txId,
      gasSpent: '0',
      timestamp: new Date(),
      status: 'failed',
      errorMessage,
      retries,
    };

    await this.addReport(chainId, report);
    this.logger.warn(
      `[${chainId}] Recorded failed tx ${txType}-${txId} | Error: ${errorMessage}`,
    );
  }

  /**
   * Add a report to the chain's report file
   */
  private async addReport(chainId: number, report: TransactionReport) {
    // Update in-memory cache
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

    // Save to file
    await this.saveChainReport(chainId, chainReport);
  }

  /**
   * Save chain report to file
   */
  private async saveChainReport(chainId: number, report: ChainReport) {
    const filename = join(this.reportsDir, `chain-${chainId}.json`);

    try {
      await fs.writeFile(filename, JSON.stringify(report, null, 2), 'utf-8');
    } catch (error) {
      this.logger.error(`Failed to save report for chain ${chainId}:`, error);
    }
  }

  /**
   * Generate daily summary report
   */
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

        // Reset daily stats but keep transactions for reference
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
   * Get report for a specific chain
   */
  getChainReport(chainId: number): ChainReport | null {
    return this.chainReports.get(chainId) || null;
  }

  /**
   * Get all chain reports
   */
  getAllReports(): ChainReport[] {
    return Array.from(this.chainReports.values());
  }

  /**
   * Get summary statistics
   */
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

  /**
   * Log periodic stats
   */
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

  /**
   * Helper: Ensure necessary directories exist
   */
  private async ensureDirectories() {
    try {
      await fs.mkdir(this.reportsDir, { recursive: true });
      await fs.mkdir(this.dailyReportsDir, { recursive: true });
      this.logger.log('Report directories initialized');
    } catch (error) {
      this.logger.error('Failed to create report directories:', error);
    }
  }

  /**
   * Helper: Load existing reports on startup
   */
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

  /**
   * Helper: Add two gas values (as strings to maintain precision)
   */
  private addGasValues(a: string, b: string): string {
    const aNum = parseFloat(a) || 0;
    const bNum = parseFloat(b) || 0;
    return (aNum + bNum).toFixed(18);
  }

  /**
   * Export report as CSV for a specific chain
   */
  async exportToCSV(chainId: number): Promise<string | null> {
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
