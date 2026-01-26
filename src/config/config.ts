export const config = () => ({
  tokenHoldersParsingEnabled:
    process.env.TOKEN_HOLDERS_PARSING_ENABLED === 'true',
  walletPrivateKey: process.env.WALLET_PRIVATE_KEY,
});

export const Commands = {
  SYNC_LABELS: 'sync:labels',
  DRAW_DAO_IMAGES: 'draw:dao-images',
};
