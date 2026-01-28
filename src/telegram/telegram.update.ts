import { Command, Ctx, Start, Update, Action } from 'nestjs-telegraf';
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
    const keyboard = await this.telegramService.getDaoSelectionKeyboard();

    await ctx.reply('🏛️ <b>Select a DAO:</b>', {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  }

  @Action(/^dao_(.+)$/)
  async showDaoInfo(@Ctx() ctx: Context) {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !('data' in callbackQuery)) return;

    await ctx.answerCbQuery();

    const daoSymbol = callbackQuery.data.replace('dao_', '');
    const msg = await this.telegramService.getSingleDaoInfo(daoSymbol);

    await ctx.editMessageText(msg, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: {
        inline_keyboard: [
          [{ text: '◀️ Back to DAOs', callback_data: 'back_to_daos' }],
        ],
      },
    });
  }

  @Action('back_to_daos')
  async backToDaos(@Ctx() ctx: Context) {
    await ctx.answerCbQuery();

    const keyboard = await this.telegramService.getDaoSelectionKeyboard();

    await ctx.editMessageText('🏛️ <b>Select a DAO:</b>', {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  }

  @Command('ping')
  async ping(@Ctx() ctx: Context) {
    await ctx.reply('pong 🏓');
  }
}
