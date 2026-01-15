import { Injectable } from '@nestjs/common';
import { IBuildersMemory } from '@stabilitydao/host/out/activity/builder';
import { IOSMemory } from '@stabilitydao/host/out/api';
import { IDAOData } from '@stabilitydao/host/out/host';
import { daos } from '@stabilitydao/host/out';
import { AnalyticsService } from 'src/analytics/analytics.service';
import { GithubService } from 'src/github/github.service';
import { OnChainDataService } from 'src/on-chain-data/on-chain-data.service';
import { RevenueService } from 'src/revenue/revenue.service';

@Injectable()
export class MemoryService {
  private daos: IDAOData[] = [];
  constructor(
    private readonly githubService: GithubService,
    private readonly analyticsService: AnalyticsService,
    private readonly revenueService: RevenueService,
    private readonly onChainDataService: OnChainDataService,
  ) {
    this.daos = daos;
  }

  getOSMemory(): IOSMemory {
    const buildersMemory = this.getBuilderMemory();
    const analytics = this.analyticsService.getAnalytics();
    return {
      builders: buildersMemory,
      daos: this.getDaosFullData(),
      chainTvl: analytics.chainTvls,
      prices: {},
    };
  }

  getBuilderMemory(): IBuildersMemory {
    const poolsMemory: any = {};

    for (const dao of this.daos) {
      poolsMemory[dao.symbol] = {
        conveyors: {},
        openIssues: { pools: {}, total: {} },
      };

      const agent = dao.daoMetaData?.builderActivity;

      const repos = this.githubService.getRepos();

      for (const repo of repos) {
        const issues = this.githubService.getIssuesByRepo(repo);

        poolsMemory[dao.symbol].openIssues.total[repo] = issues.length;
      }

      for (const pool of agent?.pools ?? []) {
        poolsMemory[dao.symbol].openIssues.pools[pool.name] = [];

        const issues = this.githubService.getIssues();

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

  private getDaosFullData(): IOSMemory['daos'] {
    const result: IOSMemory['daos'] = {};
    for (const dao of this.daos) {
      result[dao.symbol] = {
        oraclePrice: '0',
        coingeckoPrice: '0',
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
