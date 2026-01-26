import { Command, Ctx, Start, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { TelegramService } from './telegram.service';

@Update()
export class TelegramUpdate {
  constructor(private readonly telegramService: TelegramService) {}
  @Start()
  async start(@Ctx() ctx: Context) {
    await ctx.reply('Привет! Я бот 🤖');
  }

  @Command('daochats')
  async daoChats(@Ctx() ctx: Context) {
    const msg = await this.telegramService.getDaoTelegramStats();
    await ctx.reply(msg, {
      parse_mode: 'HTML',
      link_preview_options: {
        is_disabled: true,
      },
    });
  }

  @Command('daos')
  async daos(@Ctx() ctx: Context) {
    const msg = await this.telegramService.getDaosInfo();

    await ctx.reply(msg, { parse_mode: this.telegramService.markdown });
  }
  @Command('ping')
  async ping(@Ctx() ctx: Context) {
    await ctx.reply('pong 🏓');
  }
}
