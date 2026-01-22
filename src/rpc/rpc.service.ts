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
import { privateKeyToAccount } from 'viem/accounts';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RpcService {
  private publicClientsMap: Map<string, PublicClient> = new Map();
  private walletClientsMap: Map<string, WalletClient> = new Map();
  constructor(
    private readonly chains: ChainsService,
    private readonly configService: ConfigService,
  ) {
    for (const chainId of this.chains.getChainIds()) {
      const chain = this.chains.getChainById(chainId);
      if (!chain) {
        continue;
      }

      const viemChain = this.chains.getViemChainById(chainId);

      if (!viemChain) {
        continue;
      }

      this.setPublicClient(viemChain);
      this.setWalletClient(viemChain);
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

  private setPublicClient(chain: Chain) {
    const rpcUrl = chain.rpcUrls.default[0];

    const publicClient = createPublicClient({
      chain: chain,
      transport: http(rpcUrl),
    });

    this.publicClientsMap.set(chain.id.toString(), publicClient);
  }

  private setWalletClient(chain: Chain) {
    const rpcUrl = chain.rpcUrls.default[0];

    const accountPrivateKey = this.configService.get<`0x${string}`>(
      'ACCOUNT_PRIVATE_KEY',
    );

    if (!accountPrivateKey) {
      return;
    }

    const account = privateKeyToAccount(accountPrivateKey);

    const walletClient = createWalletClient({
      account,
      chain: chain,
      transport: http(rpcUrl),
    });

    this.walletClientsMap.set(chain.id.toString(), walletClient);
  }
}
