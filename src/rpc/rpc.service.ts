import { Injectable } from '@nestjs/common';
import { ChainsService } from 'src/chains/chains.service';
import { createPublicClient, http, PublicClient } from 'viem';

@Injectable()
export class RpcService {
  private publicClientsMap: Map<string, PublicClient> = new Map();
  constructor(private readonly chains: ChainsService) {
    for (const chainId of this.chains.getChainIds()) {
      const chain = this.chains.getChainById(chainId);
      if (!chain) {
        continue;
      }

      const viemChain = this.chains.getViemChainById(chainId);

      if (!viemChain) {
        continue;
      }

      const rpcUrl = viemChain.rpcUrls.default[0];

      const client = createPublicClient({
        chain: viemChain,
        transport: http(rpcUrl),
      });

      this.publicClientsMap.set(chainId, client);
    }
  }

  getClient(chainId: string) {
    return this.publicClientsMap.get(chainId);
  }
}
