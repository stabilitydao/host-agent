import { Injectable } from '@nestjs/common';
import { IDAOData } from '@stabilitydao/host';
import { activities, Activity } from '@stabilitydao/host/out/activity';
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
    if (!this.daos?.length) {
      return '❌ <b>No DAOs available.</b>';
    }

    const phaseEmoji: Record<string, string> = {
      DRAFT: '📝',
      SEED: '🌱',
      SEED_FAILED: '💥',
      DEVELOPMENT: '⚙️',
      TGE: '💰',
      LIVE_CLIFF: '⏳',
      LIVE_VESTING: '🔒',
      LIVE: '🎉',
    };

    const out: string[] = [];
    out.push('<b>🏛️ DAOs</b>\n');

    for (const dao of this.daos) {
      // ───────────────── DAO HEADER ─────────────────
      out.push('━━━━━━━━━━━━━━━━━━━━');
      out.push(
        `<b>${dao.name}</b> ${dao.symbol.toUpperCase()} ` +
          `<i>[${dao.phase}]</i> ${phaseEmoji[dao.phase] ?? '❔'}`,
      );

      // ───────────────── ACTIVITIES ─────────────────
      if (dao.activity?.length) {
        const activityTitles = dao.activity
          .map((a) => activities[a]?.title ?? a)
          .join(', ');
        out.push(`<i>Activities:</i> ${activityTitles}\n`);
      }

      // ───────────────── UNITS ──────────────────────
      if (dao.units?.length) {
        out.push('<b>Units</b>');
      }

      for (let i = 0; i < (dao.units?.length ?? 0); i++) {
        const unit = dao.units[i];
        const meta = dao.unitsMetaData?.[i];

        const emoji = meta?.emoji ? `${meta.emoji} ` : '';
        const status = meta?.status ?? 'UNKNOWN';
        const revenueShare = meta?.revenueShare ?? 0;

        out.push(
          `  ${emoji}<b>${meta?.name ?? unit.unitId}</b> ` +
            `<i>[${status}]</i>`,
        );
        out.push(`     Revenue Share: <b>${revenueShare}%</b>`);

        // UI links
        if (meta?.ui?.length) {
          if (meta.ui.length === 1) {
            const link = meta.ui[0];
            out.push(`     UI: <a href="${link.href}">${link.title}</a>`);
          } else {
            out.push('     UI:');
            for (const link of meta.ui) {
              out.push(`      • <a href="${link.href}">${link.title}</a>`);
            }
          }
        }

        out.push(''); // spacing between units
      }

      // ───────────────── BUILDER ────────────────────
      if (dao.activity?.includes(Activity.BUILDER)) {
        const builder = dao.daoMetaData?.builderActivity;
        if (builder) {
          out.push('<b>BUILDER</b>');

          if (builder.repo?.length) {
            out.push('  Repos:');
            for (const repo of builder.repo) {
              out.push(`   • ${repo}`);
            }
          }

          if (typeof builder.workers === 'number') {
            out.push(`  Workers: <b>${builder.workers}</b>`);
          }

          if (builder.pools?.length) {
            out.push(`  Pools: ${builder.pools.join(', ')}`);
          }

          if (builder.conveyors?.length) {
            out.push(`  Conveyors: ${builder.conveyors.join(', ')}`);
          }

          out.push('');
        }
      }

      // ───────────────── FUNDING ────────────────────
      if (dao.funding?.length) {
        const totalRaised = dao.funding.reduce(
          (sum, f) => sum + (f.raised ?? 0),
          0,
        );
        out.push(`<i>Total Raised:</i> <b>${totalRaised} tokens</b>`);
      }
    }

    return out.join('\n');
  }

  async sendMessage(chatId: number, text: string) {
    return this.bot.telegram.sendMessage(chatId, text, {
      parse_mode: this.markdown,
    });
  }
}
