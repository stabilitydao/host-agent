import { IHostAgentMemoryV3 } from "@stabilitydao/host/out/api";

export type Analytics = {
  chainTvls: IHostAgentMemoryV3['data']['chainTvl'];
  prices: IHostAgentMemoryV3['data']['prices']
};
