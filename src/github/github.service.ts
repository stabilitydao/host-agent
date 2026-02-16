import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IGithubIssueV2 } from '@stabilitydao/host/out';
import { IDAOData } from '@stabilitydao/host/out/host';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { App, Octokit } from 'octokit';
import { getFullDaos } from 'src/utils/getDaos';
import { sleep } from '../utils/sleep';
import { FullIssue, Issues, Repos } from './types/issue';
import { IBuildersMemoryV3 } from '@stabilitydao/host/out/api';
dotenv.config();

@Injectable()
export class GithubService implements OnModuleInit {
  public issues: Issues = {};
  public repos: Repos = {};

  public builderMemory: IBuildersMemoryV3 = {};

  private app: App;
  private message: string;
  private logger = new Logger(GithubService.name);
  private installationId: number;
  private daos: IDAOData[];

  private handleIssueIsRunning = false;
  private fullSyncIsRunning = false;

  constructor(private config: ConfigService) {
    this.daos = getFullDaos();
  }

  async onModuleInit() {
    const appId = this.config.getOrThrow<string>('APP_ID');
    const privateKeyPath = this.config.getOrThrow<string>('PRIVATE_KEY_PATH');
    const privateKey = fs.readFileSync(privateKeyPath, 'utf-8');
    const secret = this.config.get('WEBHOOK_SECRET');
    const enterprise = this.config.get('ENTERPRISE_HOSTNAME');

    this.app = new App({
      appId,
      privateKey,
      webhooks: { secret },
      ...(enterprise && {
        Octokit: Octokit.defaults({
          baseUrl: `https://${enterprise}/api/v3`,
        }),
      }),
    });

    this.message = 'Good luck!';

    await this.resolveInstallationId();
    await this.updateBuilderMemory().catch((e) => this.logger.error(e));
    await this.updateBuilderData().catch((e) => this.logger.error(e));

    const { data } = await this.app.octokit.request('/app');
    this.logger.log(
      `Authenticated as GitHub App '${data.name}' (id: ${data.id})`,
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async hourlyFullSync() {
    await this.fullIssuesUpdate();
  }

  async handlePROpened(payload: any) {
    const { pull_request, repository, installation } = payload;
    this.logger.log(`PR opened: #${pull_request.number}`);

    try {
      const octokit = await this.app.getInstallationOctokit(installation.id);
      await octokit.rest.issues.createComment({
        owner: repository.owner.login,
        repo: repository.name,
        issue_number: pull_request.number,
        body: this.message,
      });
    } catch (error: any) {
      this.logger.error(
        `Error posting comment: ${error.response?.data?.message || error}`,
      );
    }
  }

  async handleIssue(payload: any) {
    await this.waitForUnlock();
    this.handleIssueIsRunning = true;

    const { repository, action } = payload;
    const repoKey = `${repository.owner.login}/${repository.name}`;
    this.logger.log(`Issue event: ${action} in ${repoKey}`);

    try {
      // Wait a few seconds before fetching the issues
      await sleep(3);

      await this.updateBuilderMemory();
    } catch (error: any) {
      this.logger.error(
        `Failed to refresh issues for ${repoKey}: ${error.response?.data?.message || error}`,
      );
    } finally {
      this.handleIssueIsRunning = false;
    }
  }

  async syncLabels() {
    for (const dao of this.daos) {
      const labels = dao.unitEmitData
        .flatMap((u) => u.pool?.label)
        .filter((l) => !!l);

      const octokit = await this.getOctokit();

      const repos = dao.unitEmitData
        .flatMap((u) => u.pool?.repos)
        .filter((r): r is string => !!r);

      for (const repo of repos) {
        const [owner, repoName] = repo.split('/');
        this.logger.log(`🔄 Syncing labels for ${repo}...`);

        const { data: existing } = await octokit.rest.issues.listLabelsForRepo({
          owner,
          repo: repoName,
          per_page: 100,
        });

        for (const label of labels) {
          const existingLabel = existing.find((l) => l.name === label.name);
          const color = label.color.replace('#', '');

          this.logger.log(`🔍 Checking ${label.name}`);

          if (!existingLabel) {
            this.logger.log(`➕ Creating ${label.name}`);
            await octokit.rest.issues.createLabel({
              owner,
              repo: repoName,
              name: label.name,
              color,
              description: label.description,
            });
          } else if (
            existingLabel.color !== color ||
            existingLabel.description !== label.description
          ) {
            this.logger.log(`✏️ Updating ${label.name}`);
            await octokit.rest.issues.updateLabel({
              owner,
              repo: repoName,
              name: label.name,
              color,
              description: label.description,
            });
          } else {
            this.logger.log(`✅ ${label.name} is up to date`);
          }
        }
      }
      this.logger.log('✅ All labels synced successfully!');
    }
  }

  getRepos() {
    return this.repos;
  }

  getIssues() {
    return Object.values(this.issues)
      .flat()
      .map((i) => ({
        ...i,
        assignees: i.assignee,
      }));
  }

  getIssuesV2(): IGithubIssueV2[] {
    return Object.values(this.issues)
      .flat()
      .map((i) => ({
        ...i,
        assignee: undefined,
      }));
  }

  getIssuesByRepo(repo: string) {
    return this.issues[repo].map((i) => ({
      ...i,
      assignees: i.assignee,
    }));
  }

  getIssuesByRepoV2(repo: string): IGithubIssueV2[] {
    return this.issues[repo]?.map((i) => ({
      ...i,
      assignee: undefined,
    }));
  }

  private async resolveInstallationId() {
    const envInstallationId = this.config.get<number>('INSTALLATION_ID');
    if (envInstallationId) {
      this.installationId = envInstallationId;
      this.logger.log(`Using installation ID from .env: ${envInstallationId}`);
      return;
    }

    const { data: installations } =
      await this.app.octokit.rest.apps.listInstallations();

    if (!installations.length) {
      throw new Error('No installations found for GitHub App');
    }

    this.installationId = installations[0].id;
    this.logger.log(`Detected installation ID: ${this.installationId}`);
  }

  private async getOctokit() {
    if (!this.installationId) {
      await this.resolveInstallationId();
    }
    return this.app.getInstallationOctokit(this.installationId);
  }

  private async waitForUnlock() {
    while (this.handleIssueIsRunning || this.fullSyncIsRunning) {
      await sleep(3);
    }
  }

  private async fullIssuesUpdate() {
    await this.waitForUnlock();
    this.fullSyncIsRunning = true;

    try {
      await this.updateBuilderMemory();
      this.logger.log('Full issues update completed.');
    } catch (error) {
      this.logger.error(`Full issues update failed: ${error}`);
    } finally {
      this.fullSyncIsRunning = false;
    }
  }

  private async updateBuilderData() {
    for (const dao of this.daos) {
      const repos = dao?.unitEmitData
        ?.flatMap((u) => u.pool?.repos)
        .filter((r): r is string => !!r);
      if (!repos.length) continue;

      const octokit = await this.getOctokit();

      this.repos[dao.symbol] = {};

      for (const repo of repos) {
        const [owner, repoName] = repo.split('/');
        this.logger.log(`Fetching issues for ${repo}...`);

        try {
          const { data: issues } = await octokit.rest.issues.listForRepo({
            owner,
            repo: repoName,
            per_page: 100,
          });

          this.issues[repo] = issues.map((i) => this.issueToDTO(i, repo));
        } catch (e) {
          this.logger.error(`Failed to fetch issues for ${repo}`);
        }
      }

      for (const repo of repos) {
        const [owner, repoName] = repo.split('/');
        this.logger.log(`Fetching repo ${repo}...`);

        const { data: repoData } = await octokit.rest.repos.get({
          owner,
          repo: repoName,
        });

        const { data: collaborators } =
          await octokit.rest.repos.listCollaborators({
            owner,
            repo: repoName,
            per_page: 100,
          });

        this.repos[dao.symbol][repo] = {
          openIssues: this.issues[repo].length,
          private: repoData.private,
          access: collaborators.map((c) => ({
            username: c.login,
            img: c.avatar_url,
          })),
          stars: repoData.stargazers_count,
        };
      }
    }
  }

  private async updateBuilderMemory() {
    const builderData: IBuildersMemoryV3 = {};
    for (const dao of this.daos) {
      builderData[dao.symbol] = {
        openIssues: {},
        repos: {},
      };
      const octokit = await this.getOctokit();
      const units = dao.units;
      for (const unit of units) {
        const metadata = dao.unitEmitData?.[units.indexOf(unit)];
        builderData[dao.symbol].openIssues[unit.unitId] = [];

        const repos = metadata?.pool?.repos ?? [];
        for (const repo of repos) {
          const [owner, repoName] = repo.split('/');
          this.logger.log(`Fetching issues for ${repo}...`);

          try {
            const { data: issues } = await octokit.rest.issues.listForRepo({
              owner,
              repo: repoName,
              per_page: 100,
            });

            const { data: repoData } = await octokit.rest.repos.get({
              owner,
              repo: repoName,
            });

            const { data: collaborators } =
              await octokit.rest.repos.listCollaborators({
                owner,
                repo: repoName,
                per_page: 100,
              });

            const issuesCount = issues.length;

            issues.forEach((issue) => {
              const issueData = this.issueToDTO(issue, repo);
              builderData[dao.symbol].openIssues[unit.unitId].push(issueData);
            });

            builderData[dao.symbol].repos[repo] = {
              openIssues: issuesCount,
              private: repoData.private,
              access: collaborators.map((c) => ({
                username: c.login,
                img: c.avatar_url,
              })),
              stars: repoData.stargazers_count,
            };
          } catch (e) {
            this.logger.error(`Failed to fetch issues for ${repo}`);
          }
        }
      }
    }
    this.builderMemory = builderData;
  }

  private issueToDTO(
    issue: Awaited<
      ReturnType<typeof this.app.octokit.rest.issues.listForRepo>
    >['data'][number],
    repo: string,
  ): FullIssue {
    const assignees =
      issue.assignees?.map((assignee) => ({
        img: assignee.avatar_url,
        username: assignee.login,
      })) ?? [];
    return {
      id: issue.number,
      repoId: issue.number,
      title: issue.title,
      assignee: assignees[0],
      assignees,
      labels: (issue.labels as any[]).map((l) => ({
        name: l.name,
        description: l.description,
        color: l.color,
      })),
      tasks: this.parseTasksFromIssue(issue.body ?? ''),
      body: issue.body ?? '',
      repo,
    };
  }

  private parseTasksFromIssue(issueBody: string): IGithubIssueV2['tasks'] {
    const tasks: IGithubIssueV2['tasks'] = [];
    const lines = issueBody.split('\n');
    let currentCategory: string | undefined;

    const taskPattern = /^[\s*-]*\[([x\s])\]\s*(.+)$/i;
    const categoryPattern = /^\*\s+([^[\n]+)$/;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        continue;
      }

      const categoryMatch = trimmedLine.match(categoryPattern);
      if (categoryMatch && !trimmedLine.includes('[')) {
        currentCategory = categoryMatch[1].trim();
        continue;
      }

      const taskMatch = trimmedLine.match(taskPattern);
      if (taskMatch) {
        const done = taskMatch[1].toLowerCase() === 'x';
        const name = taskMatch[2].trim();

        tasks.push({
          done,
          name,
          category: currentCategory,
        });
      }
    }

    return tasks;
  }
}
