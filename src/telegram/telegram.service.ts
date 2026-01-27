import { Injectable } from '@nestjs/common';
import { IDAOData } from '@stabilitydao/host';
import { InjectBot } from 'nestjs-telegraf';
import { getFullDaos } from 'src/utils/getDaos';
import { Telegraf } from 'telegraf';
import * as templates from './templates';

@Injectable()
export class TelegramService {
  private readonly daos: IDAOData[];

  public readonly markdown = 'HTML';
  constructor(@InjectBot() private readonly bot: Telegraf) {
    this.daos = getFullDaos();
  }

  async getDaosInfo(): Promise<string> {
    return templates.daoInfoTemplate(this.daos);
  }

  async getDaoTelegramStats(): Promise<string> {
    return templates.daoTelegramStatsTemplate(this.daos, async (username) => {
      return this.bot.telegram.getChatMembersCount(`@${username}`);
    });
  }
  async sendMessage(chatId: number, text: string) {
    return this.bot.telegram.sendMessage(chatId, text, {
      parse_mode: this.markdown,
    });
  }
}
