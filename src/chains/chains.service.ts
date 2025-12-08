import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Chain, chains } from '@stabilitydao/stability';
import * as allChains from 'viem/chains';
import { Chain as ViemChain } from 'viem/chains';

@Injectable()
export class ChainsService {
  private chainsById: { [chainId: string]: Chain };
  private chainByName: { [name: string]: Chain };

  private readonly DISABLED_CHAINS_ENV_KEY = 'DISABLED_CHAINS';
  constructor(private readonly configService: ConfigService) {
    const disabledChains = this.getDisabledChains();

    this.chainsById = Object.entries(chains).reduce((acc, [id, chain]) => {
      if (!disabledChains.includes(+id)) {
        acc[id] = chain;
      }
      return acc;
    }, {});
    this.chainByName = Object.entries(chains).reduce((acc, [id, chain]) => {
      if (!disabledChains.includes(+id)) {
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
    return Object.values(chains).filter(
      (c) => !this.getDisabledChains().includes(+c.chainId),
    );
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

  private getDisabledChains() {
    return (
      this.configService
        .get<string[]>(this.DISABLED_CHAINS_ENV_KEY)
        ?.map(Number) ?? []
    );
  }
}
