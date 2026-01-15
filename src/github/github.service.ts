import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { daoMetaData, daos } from '@stabilitydao/host/out';
import { IDAOData } from '@stabilitydao/host/out/host';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { App, Octokit } from 'octokit';
import { sleep } from 'src/utils/sleep';
import { FullIssue, Issues } from './types/issue';
dotenv.config();

@Injectable()
export class GithubService implements OnModuleInit {
  public issues: Issues = {};

  private app: App;
  private message: string;
  private logger = new Logger(GithubService.name);
  private installationId: number;
  private daos: IDAOData[];

  private handleIssueIsRunning = false;
  private fullSyncIsRunning = false;

  constructor(private config: ConfigService) {
    this.daos = daos;
    for (const dao of this.daos) {
      const metadata = daoMetaData[dao.symbol.toLowerCase()];
      dao.daoMetaData = metadata;
    }
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
    await this.updateIssues().catch((e) => this.logger.error(e));

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
      const octokit = await this.getOctokit();
      const [owner, repo] = [repository.owner.login, repository.name];

      const { data: issues } = await octokit.rest.issues.listForRepo({
        owner,
        repo,
        per_page: 100,
      });

      this.issues[repoKey] = issues.map((i) => this.issueToDTO(i, repoKey));
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
      const builder = dao.daoMetaData?.builderActivity;
      if (!builder) {
        this.logger.error('Builder agent not found');
        continue;
      }

      const labels = [
        ...builder.pools.map((p) => p.label),
        ...builder.conveyors.map((c) => c.label),
      ];

      const uniqueLabels = Object.values(
        Object.fromEntries(labels.map((l) => [l.name, l])),
      );

      const octokit = await this.getOctokit();

      for (const repo of builder.repo) {
        const [owner, repoName] = repo.split('/');
        this.logger.log(`🔄 Syncing labels for ${repo}...`);

        const { data: existing } = await octokit.rest.issues.listLabelsForRepo({
          owner,
          repo: repoName,
          per_page: 100,
        });

        for (const label of uniqueLabels) {
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
    return Object.keys(this.issues);
  }

  getIssues() {
    return Object.values(this.issues).flat();
  }
  getIssuesByRepo(repo: string) {
    return this.issues[repo];
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
      await this.updateIssues();
      this.logger.log('Full issues update completed.');
    } catch (error) {
      this.logger.error(`Full issues update failed: ${error}`);
    } finally {
      this.fullSyncIsRunning = false;
    }
  }

  private async updateIssues() {
    for (const dao of this.daos) {
      const builder = dao?.daoMetaData?.builderActivity;
      if (!builder) continue;

      const repos = builder.repo ?? [];
      const octokit = await this.getOctokit();

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
    }
  }

  private issueToDTO(
    issue: Awaited<
      ReturnType<typeof this.app.octokit.rest.issues.listForRepo>
    >['data'][number],
    repo: string,
  ): FullIssue {
    return {
      id: issue.id,
      repoId: issue.number,
      title: issue.title,
      assignees: {
        username: issue.assignee?.login ?? '',
        img: issue.assignee?.avatar_url ?? '',
      },
      labels: (issue.labels as any[]).map((l) => ({
        name: l.name,
        description: l.description,
        color: l.color,
      })),
      body: issue.body ?? '',
      repo,
    };
  }
}
