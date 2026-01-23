export const config = () => ({
  tokenHoldersParsingEnabled:
    process.env.TOKEN_HOLDERS_PARSING_ENABLED === 'true',
  walletPrivateKey: process.env.WALLET_PRIVATE_KEY,
});
