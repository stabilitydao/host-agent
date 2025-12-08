import { RevenueChart } from '@stabilitydao/stability/out/api.types';
import { IDAO } from '@stabilitydao/stability/out/os';
import { RpcService } from 'src/rpc/rpc.service';
import { SubgraphService } from 'src/subgraph/subgraph.service';
import { OnChainData } from './types/dao';

export abstract class DaoService {
  dao: IDAO;

  subgraphProvider: SubgraphService;
  rpcProvider: RpcService;
  constructor(
    dao: IDAO,
    subgraphProvider: SubgraphService,
    rpcProvider: RpcService,
  ) {
    this.dao = dao;
    this.subgraphProvider = subgraphProvider;
    this.rpcProvider = rpcProvider;
  }

  abstract getRevenueChart(): Promise<RevenueChart>;
  abstract getOnchainData(): Promise<OnChainData>;
}
