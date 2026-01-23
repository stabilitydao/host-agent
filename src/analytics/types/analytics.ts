import { IOSMemory } from "@stabilitydao/host/out/api";

export type Analytics = {
  chainTvls: IOSMemory['chainTvl'];
  prices: IOSMemory['prices'];
};
