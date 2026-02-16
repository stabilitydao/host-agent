import { IDAOData } from '@stabilitydao/host';
import { activities } from '@stabilitydao/host/out/activity';

// ───────────── PHASE EMOJIS ─────────────
export const phaseEmoji: Record<string, string> = {
  DRAFT: '📝',
  SEED: '🌱',
  SEED_FAILED: '💥',
  DEVELOPMENT: '⚙️',
  TGE: '💰',
  LIVE_CLIFF: '⏳',
  LIVE_VESTING: '🔒',
  LIVE: '🎉',
};

// ───────────── SINGLE DAO INFO TEMPLATE ─────────────
export function singleDaoInfoTemplate(dao: IDAOData): string {
  const lines: string[] = [];

  // Header
  lines.push(
    `<b>${dao.name}</b> ${dao.symbol.toUpperCase()} ` +
      `<i>[${dao.phase}]</i> ${phaseEmoji[dao.phase] ?? '❔'}`,
  );
  lines.push('━━━━━━━━━━━━━━━━━━━━\n');

  // Activities
  if (dao.activity?.length) {
    const activityTitles = dao.activity
      .map((a) => activities[a]?.title ?? a)
      .join(', ');
    lines.push(`<b>Activities:</b> ${activityTitles}\n`);
  }

  // Units
  if (dao.units?.length) {
    lines.push('<b>Units</b>');
    for (let i = 0; i < dao.units.length; i++) {
      const unit = dao.units[i];
      const meta = dao.metaData?.[i];
      const emoji = meta?.emoji ? `${meta.emoji} ` : '';
      const status = meta?.status ?? 'UNKNOWN';
      const revenueShare = meta?.revenueShare ?? 0;

      lines.push(
        `  ${emoji}<b>${meta?.name ?? unit.unitId}</b> <i>[${status}]</i>`,
      );
      lines.push(`     Revenue Share: <b>${revenueShare}%</b>`);

      if (meta?.ui?.length) {
        if (meta.ui.length === 1) {
          const link = meta.ui[0];
          lines.push(`     UI: <a href="${link.href}">${link.title}</a>`);
        } else {
          lines.push('     UI:');
          for (const link of meta.ui) {
            lines.push(`      • <a href="${link.href}">${link.title}</a>`);
          }
        }
      }

      lines.push('');
    }
  }

  const repos = dao.unitEmitData
    .flatMap((u) => u.pool?.repos)
    .filter((r): r is string => !!r);
  lines.push('<b>BUILDER</b>');
  if (repos.length) {
    lines.push('  <b>Repos</b>:');
    for (const repo of repos) lines.push(`   • ${repo}`);
  }

  lines.push('');

  // Funding
  if (dao.funding?.length) {
    const totalRaised = dao.funding.reduce(
      (sum, f) => sum + (f.raised ?? 0),
      0,
    );
    lines.push(`<b>Total Raised:</b> <b>${totalRaised} tokens</b>`);
  }

  return lines.join('\n');
}

// ───────────── GENERAL DAO INFO TEMPLATE ─────────────
export function daoInfoTemplate(daos: IDAOData[]): string {
  if (!daos?.length) return '❌ <b>No DAOs available.</b>';

  const lines: string[] = [];
  lines.push('<b>🏛️ DAOs</b>\n');

  for (const dao of daos) {
    lines.push('━━━━━━━━━━━━━━━━━━━━');

    // Header
    lines.push(
      `<b>${dao.name}</b> ${dao.symbol.toUpperCase()} ` +
        `<i>[${dao.phase}]</i> ${phaseEmoji[dao.phase] ?? '❔'}`,
    );

    // Activities
    if (dao.activity?.length) {
      const activityTitles = dao.activity
        .map((a) => activities[a]?.title ?? a)
        .join(', ');
      lines.push(`<i>Activities:</i> ${activityTitles}\n`);
    }

    // Units
    if (dao.units?.length) lines.push('<b>Units</b>');
    for (let i = 0; i < (dao.units?.length ?? 0); i++) {
      const unit = dao.units[i];
      const meta = dao.unitEmitData?.[i];
      const emoji = meta?.emoji ? `${meta.emoji} ` : '';
      const status = meta?.status ?? 'UNKNOWN';
      const revenueShare = meta?.revenueShare ?? 0;

      lines.push(
        `  ${emoji}<b>${meta?.name ?? unit.unitId}</b> <i>[${status}]</i>`,
      );
      lines.push(`     Revenue Share: <b>${revenueShare}%</b>`);

      if (meta?.ui?.length) {
        if (meta.ui.length === 1) {
          const link = meta.ui[0];
          lines.push(`     UI: <a href="${link.href}">${link.title}</a>`);
        } else {
          lines.push('     UI:');
          for (const link of meta.ui) {
            lines.push(`      • <a href="${link.href}">${link.title}</a>`);
          }
        }
      }

      lines.push('');
    }

    const repos = dao.unitEmitData
      .flatMap((u) => u.pool?.repos)
      .filter((r): r is string => !!r);
    lines.push('<b>BUILDER</b>');
    if (repos.length) {
      lines.push('  <b>Repos</b>:');
      for (const repo of repos) lines.push(`   • ${repo}`);
    }

    // Funding
    if (dao.funding?.length) {
      const totalRaised = dao.funding.reduce(
        (sum, f) => sum + (f.raised ?? 0),
        0,
      );
      lines.push(`<i>Total Raised:</i> <b>${totalRaised} tokens</b>`);
    }
  }

  return lines.join('\n');
}

// ───────────── DAO TELEGRAM STATS TEMPLATE ─────────────
export async function daoTelegramStatsTemplate(
  daos: IDAOData[],
  getMembers: (username: string) => Promise<number>,
): Promise<string> {
  if (!daos?.length) return '❌ No DAOs available.';

  const lines: string[] = [];

  for (const dao of daos) {
    const tgLinks =
      dao.socials?.filter((s) => s.startsWith('https://t.me')) ?? [];
    if (!tgLinks.length) continue;

    lines.push(`<b>${dao.name}</b> (${dao.symbol.toUpperCase()}):`);

    for (const link of tgLinks) {
      try {
        const username = link.replace('https://t.me/', '');
        const count = await getMembers(username);
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
