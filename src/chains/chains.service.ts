import { Injectable } from '@nestjs/common';
import { ChainStatus, IChain, chains } from '@stabilitydao/host/out/chains';

import * as allChains from 'viem/chains';
import { Chain as ViemChain } from 'viem/chains';

@Injectable()
export class ChainsService {
  private chainsById: { [chainId: string]: IChain };
  private chainByName: { [name: string]: IChain };

  constructor() {
    this.chainsById = Object.entries(chains).reduce((acc, [id, chain]) => {
      if (chain.status != ChainStatus.NOT_SUPPORTED) {
        acc[id] = chain;
      }
      return acc;
    }, {});
    this.chainByName = Object.entries(chains).reduce((acc, [id, chain]) => {
      if (chain.status != ChainStatus.NOT_SUPPORTED) {
        acc[chain.name] = chain;
      }
      return acc;
    }, {});
  }

  getViemChainById(chainId: string): ViemChain | undefined {
    for (const chain in allChains) {
      if (allChains[chain].id === +chainId) {
        return allChains[chain];
      }
    }

    return undefined;
  }
  getChains() {
    return Object.values(this.chainsById);
  }

  getChainIds() {
    return Object.keys(this.chainsById);
  }

  getChainById(chainId: string) {
    return this.chainsById[chainId];
  }

  getChainByName(name: string) {
    return this.chainByName[name];
  }
}
