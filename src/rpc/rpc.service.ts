import { Injectable } from '@nestjs/common';
import { ChainsService } from '../chains/chains.service';
import {
  Chain,
  createPublicClient,
  createWalletClient,
  http,
  PublicClient,
  WalletClient,
} from 'viem';
import {
  Account,
  generatePrivateKey,
  privateKeyToAccount,
} from 'viem/accounts';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RpcService {
  private publicClientsMap: Map<string, PublicClient> = new Map();
  private walletClientsMap: Map<string, WalletClient> = new Map();
  private readonly account: Account;
  constructor(
    private readonly chains: ChainsService,
    private readonly configService: ConfigService,
  ) {
    for (const chainId of this.chains.getChainIds()) {
      const chain = this.chains.getChainById(chainId);
      if (!chain) {
        continue;
      }

      const privateKey =
        this.configService.get<`0x${string}`>('walletPrivateKey') ??
        generatePrivateKey();

      this.account = privateKeyToAccount(privateKey);

      const viemChain = this.chains.getViemChainById(chainId);

      if (!viemChain) {
        continue;
      }

      this.setPublicClient(viemChain);
      this.setWalletClient(viemChain, this.account);
    }
  }

  getPublicClient(chainId: string): PublicClient | undefined {
    return this.publicClientsMap.get(chainId);
  }

  getWalletClient(chainId: string): WalletClient | undefined {
    return this.walletClientsMap.get(chainId);
  }

  getRpcUrl(chainId: string): string | undefined {
    const chain = this.chains.getViemChainById(chainId);
    if (!chain) {
      return undefined;
    }
    return chain.rpcUrls.default.http[0];
  }

  getAccountAddress() {
    return this.account.address;
  }

  getAccount() {
    return this.account;
  }

  private setPublicClient(chain: Chain) {
    const rpcUrl = chain.rpcUrls.default[0];

    const publicClient = createPublicClient({
      chain: chain,
      transport: http(rpcUrl),
    });

    this.publicClientsMap.set(chain.id.toString(), publicClient);
  }

  private setWalletClient(chain: Chain, account: Account) {
    const rpcUrl = chain.rpcUrls.default[0];

    const walletClient = createWalletClient({
      account,
      chain: chain,
      transport: http(rpcUrl),
    });

    this.walletClientsMap.set(chain.id.toString(), walletClient);
  }
}
