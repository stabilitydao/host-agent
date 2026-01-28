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

  async sendMessage(chatId: number, text: string) {
    return this.bot.telegram.sendMessage(chatId, text, {
      parse_mode: this.markdown,
    });
  }
}
