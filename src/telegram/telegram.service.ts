import { Injectable } from '@nestjs/common';
import { IDAOData } from '@stabilitydao/host';
import { InjectBot } from 'nestjs-telegraf';
import { getFullDaos } from 'src/utils/getDaos';
import { Telegraf } from 'telegraf';

@Injectable()
export class TelegramService {
  private readonly daos: IDAOData[];

  public readonly markdown = 'HTML';
  constructor(@InjectBot() private readonly bot: Telegraf) {
    this.daos = getFullDaos();
  }

  async getDaoTelegramStats(): Promise<string> {
    if (!this.daos.length) return '❌ No DAOs available.';

    const lines: string[] = [];

    for (const dao of this.daos) {
      const tgLinks =
        dao.socials?.filter((s) => s.startsWith('https://t.me')) ?? [];
      if (!tgLinks.length) continue;

      lines.push(`<b>${dao.name}</b> (${dao.symbol.toUpperCase()}):`);

      for (const link of tgLinks) {
        try {
          const username = link.replace('https://t.me/', '');
          const count = await this.bot.telegram.getChatMembersCount(
            `@${username}`,
          );
          lines.push(`- <a href="${link}">${link}</a>: ${count} members`);
        } catch (e) {
          console.error(`Failed to get members for ${link}:`, e);
          lines.push(`- <a href="${link}">${link}</a>: ❌ unable to fetch`);
        }
      }

      lines.push(''); // blank line between DAOs
    }

    if (!lines.length) return '❌ No Telegram chats found for DAOs.';

    return lines.join('\n');
  }

  async getDaosInfo(): Promise<string> {
    if (!this.daos.length) return '❌ No DAOs available.';

    return this.daos
      .map((dao) => {
        const phaseEmoji =
          {
            DRAFT: '📝',
            SEED: '🌱',
            SEED_FAILED: '💥',
            DEVELOPMENT: '⚙️',
            TGE: '💰',
            LIVE_CLIFF: '⏳',
            LIVE_VESTING: '🔒',
            LIVE: '🎉',
          }[dao.phase] || '❔';

        const unitsCount = dao.units?.length ?? 0;
        const fundingTotal =
          dao.funding?.reduce((sum, f) => sum + f.raised, 0) ?? 0;

        return `<b>${dao.name}</b> (${dao.symbol.toUpperCase()}) ${phaseEmoji}
                - Phase: ${dao.phase}
                - Chain: ${dao.initialChain}
                - Units: ${unitsCount}
                - Total Raised: ${fundingTotal} tokens
                - Deployer: ${dao.deployer}
                `;
      })
      .join('\n-------------------\n');
  }

  async sendMessage(chatId: number, text: string) {
    return this.bot.telegram.sendMessage(chatId, text, {
      parse_mode: this.markdown,
    });
  }
}
