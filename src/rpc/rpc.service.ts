import { Injectable } from '@nestjs/common';
import { deployments } from '@stabilitydao/stability';
import { Chain, createPublicClient, http, PublicClient } from 'viem';
import * as allChains from 'viem/chains';

@Injectable()
export class RpcService {
  private publicClientsMap: Map<string, PublicClient> = new Map();
  constructor() {
    for (const chainId in deployments) {
      const chain = this.findChainById(chainId);
      if (!chain) {
        continue;
      }

      const rpcUrl = chain.rpcUrls.default.http[0];

      const client = createPublicClient({
        chain,
        transport: http(rpcUrl),
      });

      this.publicClientsMap.set(chainId, client);
    }
  }

  getClient(chainId: string) {
    return this.publicClientsMap.get(chainId);
  }

  private findChainById(chainId: string): Chain | undefined {
    return Object.values(allChains).find((c: any) => c?.id == chainId) as
      | Chain
      | undefined;
  }
}
