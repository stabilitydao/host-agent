import { IOSMemory } from '@stabilitydao/stability/out/os';
import { DaoService } from '../abstract-dao';

export type OnChainData = IOSMemory['daos'][string]['onChainData'];

export type RawUnitsData = Record<
  string,
  {
    pendingRevenue: bigint;
  }
>;

export type DaoList = Record<string, DaoService>;
