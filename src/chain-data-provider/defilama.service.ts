import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { ChainsService } from 'src/chains/chains.service';
import { statusOk } from 'src/utils/statusOk';
import { ChainDataResponse } from './types/defillama';

@Injectable()
export class DefiLlamaService {
  private readonly baseUrl = 'https://api.llama.fi/v2';
  private readonly chainsUrl = `${this.baseUrl}/chains`;
  constructor(
    private readonly httpService: HttpService,
    private readonly chains: ChainsService,
  ) {}

  async getChainTvls() {
    const tvlsMap: Map<string, number> = new Map();

    const chainDataResponse = await firstValueFrom(
      this.httpService.get<ChainDataResponse[]>(this.chainsUrl),
    );

    if (!statusOk(chainDataResponse.status)) {
      throw new Error(
        `Failed to get chains from DefiLlama: ${chainDataResponse.data}. Status: ${chainDataResponse.status}`,
      );
    }

    const chainData = chainDataResponse.data;

    for (const chain of chainData) {
      const isKnownChain =
        chain.chainId && !!this.chains.getChainById(chain.chainId.toString());
      if (!isKnownChain) {
        continue;
      }

      tvlsMap.set(chain.chainId.toString(), chain.tvl);
    }

    return tvlsMap;
  }
}
