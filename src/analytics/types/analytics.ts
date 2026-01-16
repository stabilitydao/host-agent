import { IOSMemory } from '@stabilitydao/stability/out/os';

export type Analytics = {
  chainTvls: IOSMemory['chainTvl'];
  prices: IOSMemory['prices'];
};
