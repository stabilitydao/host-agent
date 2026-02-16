import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IDAOData } from '@stabilitydao/host';
import { getFullDaos } from 'src/utils/getDaos';
import { TwitterApiProvider } from './providers/provider';
import { TwitterApi } from './providers/twitterapi/provider';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class TwitterService {
  public twitterFollowers: {
    [daoSymbol: string]: { [twitterLink: string]: number };
  } = {};

  private readonly logger = new Logger(TwitterService.name);
  private readonly daos: IDAOData[];
  private readonly twitterApi: TwitterApiProvider;

  constructor(private readonly configService: ConfigService) {
    this.daos = getFullDaos();
    this.twitterApi = new TwitterApi(
      this.configService.get('twitterApiKey') ?? '',
    );
  }

  async onModuleInit() {
    // await this.updateTwitterFollowersForDaos();
  }

  @Cron(CronExpression.EVERY_8_HOURS)
  async handleCron() {
    await this.updateTwitterFollowersForDaos();
  }

  private async updateTwitterFollowersForDaos() {
    for (const dao of this.daos) {
      await this.updateDaoTwitterFollowers(dao);
    }
  }

  private async updateDaoTwitterFollowers(dao: IDAOData) {
    const twitterAccounts = dao.socials.filter((s) =>
      s.startsWith('https://x.com/'),
    );
    for (const account of twitterAccounts) {
      if (!this.twitterFollowers[dao.symbol]) {
        this.twitterFollowers[dao.symbol] = {};
      }
      const username = account.replace('https://x.com/', '');
      const count = await this.twitterApi
        .getUserInfo(username)
        .then((res) => res.followers)
        .catch((e) => {
          this.logger.warn(`Failed to get followers for DAO ${username}`);
        });
      if (!count) continue;
      this.twitterFollowers[dao.symbol][account] = count;
    }
  }
}
