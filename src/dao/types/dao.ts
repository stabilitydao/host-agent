import { IHostAgentMemoryV3 } from '@stabilitydao/host';
import { DaoService } from '../abstract-dao';

export type OnChainData =
  IHostAgentMemoryV3['data']['daos'][string]['onChainData'];

export type UnitData = OnChainData[string]['units'];
export type DaoList = Record<string, DaoService>;
