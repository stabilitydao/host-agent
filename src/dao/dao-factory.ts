import { Injectable } from '@nestjs/common';
import { SubgraphService } from '../subgraph/subgraph.service';
import { DaoService } from './abstract-dao';
import { STBlDao } from './stbl/stbl';
import { RpcService } from '../rpc/rpc.service';
import { isLive } from './utils';
import { IDAOData } from '@stabilitydao/host/out/host';
import { AnalyticsService } from 'src/analytics/analytics.service';

@Injectable()
export class DaoFactory {
  constructor(
    private readonly subgraphService: SubgraphService,
    private readonly rpcService: RpcService,
    private readonly analyticsService: AnalyticsService,
  ) {}
  create(dao: IDAOData): DaoService | undefined {
    switch (dao.symbol) {
      case STBlDao.symbol:
        return new STBlDao(
          dao,
          this.subgraphService,
          this.rpcService,
          this.analyticsService,
        );
      default:
        if (isLive(dao)) {
          throw new Error(`Not implemented: ${dao.name}-${dao.symbol}`);
        }
        return;
    }
  }
}
