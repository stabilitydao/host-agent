import { Injectable } from '@nestjs/common';
import { IBuildersMemory } from '@stabilitydao/host/out/activity/builder';
import { IDAOData } from '@stabilitydao/host/out/host';
import { getFullDaos } from 'src/utils/getDaos';
import { GithubService } from '../github/github.service';

@Injectable()
export class MemoryService {
  private daos: IDAOData[] = [];
  constructor(private readonly githubService: GithubService) {
    this.daos = getFullDaos();
  }

  getBuilderMemory(): IBuildersMemory {
    const poolsMemory: IBuildersMemory = {};

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
