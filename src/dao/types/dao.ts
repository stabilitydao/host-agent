import { IHostAgentMemory } from '@stabilitydao/host/out/api';
import { DaoService } from '../abstract-dao';

export type OnChainData =
  IHostAgentMemory['data']['daos'][string]['onChainData'];

export type UnitData = OnChainData[string]['units'];
export type DaoList = Record<string, DaoService>;
