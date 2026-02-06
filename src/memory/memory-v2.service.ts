import { Injectable } from '@nestjs/common';
import { IDAOData, IHostAgentMemory } from '@stabilitydao/host';
import { IBuildersMemoryV2 } from '@stabilitydao/host/out/activity/builder';
import { AnalyticsService } from 'src/analytics/analytics.service';
import { GithubService } from 'src/github/github.service';
import { OnChainDataService } from 'src/on-chain-data/on-chain-data.service';
import { RevenueService } from 'src/revenue/revenue.service';
import { TxMonitoringService } from 'src/tx-sender/tx-monitoring.service';
import { getFullDaos } from 'src/utils/getDaos';
import { now } from 'src/utils/now';

@Injectable()
export class MemoryV2Service {
  private daos: IDAOData[] = [];

  private startTs: number;
  constructor(
    private readonly githubService: GithubService,
    private readonly analyticsService: AnalyticsService,
    private readonly revenueService: RevenueService,
    private readonly onChainDataService: OnChainDataService,
    private readonly txMonitoring: TxMonitoringService,
  ) {
    this.daos = getFullDaos();
  }

  onApplicationBootstrap() {
    this.startTs = now();
  }

  getHostAgentMemory(): IHostAgentMemory {
    const chainTvl = this.analyticsService.getChainTvls();
    const prices = this.analyticsService.getPricesList();
    const buildersMemory = this.getBuilderMemoryV2();
    return {
      data: {
        chainTvl,
        builders: buildersMemory,
        daos: this.getDaosFullData(),
        prices,
      },
      overview: {},
      private: false,
      started: this.startTs,
      timestamp: now(),
      txSender: this.txMonitoring.spendingReport,
    };
  }

  private getBuilderMemoryV2(): IBuildersMemoryV2 {
    const poolsMemory: IBuildersMemoryV2 = {};

    for (const dao of this.daos) {
      poolsMemory[dao.symbol] = {
        conveyors: {},
        openIssues: { pools: {}, total: {} },
      };

      const agent = dao.daoMetaData?.builderActivity;

      const repos = this.githubService.getRepos();

      for (const repo of repos) {
        const issues = this.githubService.getIssuesByRepoV2(repo);

        poolsMemory[dao.symbol].openIssues.total[repo] = issues.length;
      }

      for (const pool of agent?.pools ?? []) {
        poolsMemory[dao.symbol].openIssues.pools[pool.name] = [];

        const issues = this.githubService.getIssuesV2();

        const filtered = issues.filter((issue) =>
          issue.labels.some((l) => l.name === pool.label.name),
        );

        poolsMemory[dao.symbol].openIssues.pools[pool.name].push(...filtered);
      }

      const conveyorsMemory: any = {};
      for (const conveyor of agent?.conveyors ?? []) {
        conveyorsMemory[conveyor.name] = {};

        for (const step of conveyor.steps) {
          for (const issue of step.issues) {
            const repoKey = issue.repo;
            const stored = this.githubService.getIssuesByRepo(repoKey) || [];

            stored.forEach((i) => {
              const taskId = this.extractTaskId(
                i.title,
                conveyor.issueTitleTemplate,
                conveyor.taskIdIs,
              );

              if (!taskId) return;

              if (!conveyorsMemory[conveyor.name][taskId]) {
                conveyorsMemory[conveyor.name][taskId] = {};
              }

              const stepName = this.extractIssueStep(i.title);

              if (!conveyorsMemory[conveyor.name][taskId][stepName]) {
                conveyorsMemory[conveyor.name][taskId][stepName] = [];
              }

              conveyorsMemory[conveyor.name][taskId][stepName].push(i);
            });
          }
        }
      }

      poolsMemory[dao.symbol].conveyors = conveyorsMemory;
    }

    return poolsMemory;
  }

  private getDaosFullData(): IHostAgentMemory['data']['daos'] {
    const result: IHostAgentMemory['data']['daos'] = {};
    for (const dao of this.daos) {
      result[dao.symbol] = {
        oraclePrice: '0',
        coingeckoPrice: '0',
        socialUsers: {},
        revenueChart: this.revenueService.getRevenueChart(dao.symbol),
        onChainData: this.onChainDataService.getOnChainData(dao.symbol),
      };
    }
    return result;
  }

  private extractIssueStep(title: string): string {
    const step = title.split(': ');
    return step[step.length - 1];
  }

  private extractTaskId(
    title: string,
    template: string,
    taskIdIs: string,
  ): string | null {
    const escapedTemplate = template.replace(/([.*+?^${}()|[\]\\])/g, '\\$1');
    const regexPattern = escapedTemplate.replace(
      /%([A-Z0-9_]+)%/g,
      (_, varName) => `(?<${varName}>.+?)`,
    );

    const regex = new RegExp('^' + regexPattern + '$');
    const match = title.match(regex);

    if (!match || !match.groups) return null;

    const variable = taskIdIs.replace(/%/g, '');
    return match.groups[variable] ?? null;
  }
}
