import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { deployments } from '@stabilitydao/stability';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class SubgraphService {
  private subgraphMap = new Map();
  constructor(private readonly httpService: HttpService) {
    for (const chainId in deployments) {
      if (deployments[chainId].subgraph) {
        this.subgraphMap.set(chainId, deployments[chainId].subgraph);
      }
    }
  }

  getSubgraphByChainId(chainId: string) {
    const subgraph = this.subgraphMap.get(chainId);
    if (!subgraph) {
      throw new Error(`Subgraph not found for chainId ${chainId}`);
    }
    return subgraph;
  }

  async querySubgraph<T = any>(chainId: string, query: string): Promise<T[]> {
    const { data, status } = await firstValueFrom(
      this.httpService.post(this.getSubgraphByChainId(chainId), {
        query,
      }),
    );

    if (status !== 200) {
      throw new Error(
        `Subgraph query failed. Status: ${status}. Error: ${data.errors}`,
      );
    }

    const result = Object.values(data.data).flat() as T[];

    return result;
  }

  async querySubgraphPaginated<T = any>(
    chainId: string,
    queryGenerator: (take: number, skip: number) => string,
  ): Promise<T[]> {
    const take = 1000;
    let skip = 0;
    let result: T[] = [];
    let gotAll = false;

    do {
      const query = queryGenerator(take, skip);

      const data = await this.querySubgraph<T>(chainId, query);

      result = result.concat(data);

      skip += take;

      gotAll = data.length < take;
    } while (!gotAll);
    return result;
  }
}
