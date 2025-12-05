import { Injectable } from '@nestjs/common';
import { IDAO } from '@stabilitydao/stability';
import { SubgraphService } from 'src/subgraph/subgraph.service';
import { DaoService } from './abstract-dao';
import { STBlDao } from './stbl/stbl';
import { RpcService } from 'src/rpc/rpc.service';
import { isLive } from './utils';

@Injectable()
export class DaoFactory {
  constructor(
    private readonly subgraphService: SubgraphService,
    private readonly rpcService: RpcService,
  ) {}
  create(dao: IDAO): DaoService | undefined {
    switch (dao.symbol) {
      case STBlDao.symbol:
        return new STBlDao(dao, this.subgraphService, this.rpcService);
      default:
        if (isLive(dao)) {
          throw new Error(`Not implemented: ${dao.name}-${dao.symbol}`);
        }
        return;
    }
  }
}
