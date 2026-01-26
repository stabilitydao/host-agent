export const config = () => ({
  tokenHoldersParsingEnabled:
    process.env.TOKEN_HOLDERS_PARSING_ENABLED === 'true',
  walletPrivateKey: process.env.WALLET_PRIVATE_KEY,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  txSenderEnabled: process.env.TX_SENDER_ENABLED === 'true',
});

export const Commands = {
  SYNC_LABELS: 'sync:labels',
  DRAW_DAO_IMAGES: 'draw:dao-images',
};
