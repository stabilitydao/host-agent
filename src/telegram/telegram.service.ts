import { Injectable, Logger } from '@nestjs/common';
import { IDAOData } from '@stabilitydao/host';
import { InjectBot } from 'nestjs-telegraf';
import { getFullDaos } from 'src/utils/getDaos';
import { Telegraf } from 'telegraf';
import * as templates from './templates';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class TelegramService {
  public readonly markdown = 'HTML';

  public readonly daoUsers: {
    [daoSymbol: string]: {
      [tsLink: string]: number;
    };
  } = {};

  private readonly daos: IDAOData[];
  private readonly logger = new Logger(TelegramService.name);
  async onModuleInit() {
    await this.updateChatMembersCount();
  }

  @Cron(CronExpression.EVERY_2_HOURS)
  async handleCron() {
    await this.updateChatMembersCount();
  }

  constructor(@InjectBot() private readonly bot: Telegraf) {
    this.daos = getFullDaos();
  }

  async getDaosInfo(): Promise<string> {
    return templates.daoInfoTemplate(this.daos);
  }

  async getSingleDaoInfo(symbol: string): Promise<string> {
    const dao = this.daos.find(
      (d) => d.symbol.toLowerCase() === symbol.toLowerCase(),
    );

    if (!dao) {
      return '❌ <b>DAO not found.</b>';
    }

    return templates.singleDaoInfoTemplate(dao);
  }

  async getDaoSelectionKeyboard() {
    const buttons = this.daos.map((dao) => [
      {
        text: `${dao.name} (${dao.symbol.toUpperCase()})`,
        callback_data: `dao_${dao.symbol.toLowerCase()}`,
      },
    ]);

    return {
      inline_keyboard: buttons,
    };
  }

  async getDaoTelegramStats(): Promise<string> {
    return templates.daoTelegramStatsTemplate(this.daos, async (username) => {
      return this.bot.telegram.getChatMembersCount(`@${username}`);
    });
  }

  async updateChatMembersCount() {
    for (const dao of this.daos) {
      this.updateChatMembersCountForDao(dao);
    }
  }
  async updateChatMembersCountForDao(dao: IDAOData) {
    const tgAccounts = dao.socials?.filter((s) => s.startsWith('https://t.me'));
    for (const account of tgAccounts) {
      if (!this.daoUsers[dao.symbol]) {
        this.daoUsers[dao.symbol] = {};
      }
      const username = account.replace('https://t.me/', '');
      const count = await this.bot.telegram
        .getChatMembersCount(`@${username}`)
        .catch(() => {
          this.logger.warn(`Failed to get members for DAO ${username}`);
        });
      if (!count) continue;
      this.daoUsers[dao.symbol][account] = count;
    }
  }

  async sendMessage(chatId: number, text: string) {
    return this.bot.telegram.sendMessage(chatId, text, {
      parse_mode: this.markdown,
    });
  }
}
