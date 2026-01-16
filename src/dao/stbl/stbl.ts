import { DaoService } from '../abstract-dao';
import { OnChainData, RawUnitsData } from '../types/dao';
import { isLive } from '../utils';
import { SubgraphService } from 'src/subgraph/subgraph.service';
import { XStakingNotifyRewardEntity } from '../types/xStakign';
import { formatUnits } from 'viem/utils';
import { RpcService } from 'src/rpc/rpc.service';
import { Abi, Address, PublicClient } from 'viem';
import RevenueRouterABI from 'abi/RevenueRouterABI';
import { now } from 'src/utils/now';
import XSTBLAbi from 'abi/XSTBLABI';
import { Injectable } from '@nestjs/common';
import { deployments } from '@stabilitydao/stability';
import { IDAOData } from '@stabilitydao/host/out/host';
import { RevenueChart } from '@stabilitydao/host/out/api';

@Injectable()
export class STBlDao extends DaoService {
  public static symbol = 'STBL';
  private isLive: boolean;

  constructor(
    dao: IDAOData,
    subgraphProvider: SubgraphService,
    rpcProvider: RpcService,
  ) {
    if (dao.symbol != STBlDao.symbol)
      throw new Error(
        `Failed to initialize STBL DAO service. Expected ${STBlDao.symbol}, got ${dao.symbol}`,
      );

    super(dao, subgraphProvider, rpcProvider);

    this.isLive = isLive(this.dao);
  }

  async getRevenueChart(): Promise<RevenueChart> {
    if (!this.isLive) return {};
    const chains = this.getChains();

    const charts = await Promise.all(
      chains.map((chainId) => this.getRevenueChartForChain(chainId)),
    );

    return this.combineRevenueCharts(charts);
  }

  async getOnchainData(): Promise<OnChainData> {
    if (!this.isLive) return {};
    const chains = this.getChains();

    const data = await Promise.all(
      chains.map(async (chainId) => [
        chainId,
        await this.getOnChainDataForChain(chainId),
      ]),
    );

    return Object.fromEntries(data);
  }

  private combineRevenueCharts(charts: RevenueChart[]): RevenueChart {
    return charts.reduce((acc, chart) => {
      for (const timestamp in chart) {
        const current = +(acc[timestamp] ?? 0);
        const combined = current + +chart[timestamp];
        acc[timestamp] = combined.toString();
      }
      return acc;
    }, {});
  }

  private async getRevenueChartForChain(
    chainId: string,
  ): Promise<RevenueChart> {
    const entries =
      await this.subgraphProvider.querySubgraphPaginated<XStakingNotifyRewardEntity>(
        chainId,
        (take, skip) => `
        {
          xstakingNotifyRewardHistoryEntities(
            first: ${take}
            skip: ${skip}
            orderBy: timestamp
            orderDirection: desc
          ) {
            timestamp
            amount
          }
        }
      `,
      );

    return entries.reduce((acc, entry) => {
      const normalized = this.normalizeToEndPeriod(entry);

      acc[normalized.timestamp] = normalized.amount;

      return acc;
    }, {});
  }

  private normalizeToEndPeriod(entry: XStakingNotifyRewardEntity): {
    timestamp: number;
    amount: string;
  } {
    const date = new Date(+entry.timestamp * 1000);

    const THURSDAY = 4;
    const currentDay = date.getUTCDay();

    const daysSinceLastPeriodEnd = (currentDay - THURSDAY + 7) % 7;

    const endPeriodDate = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() - daysSinceLastPeriodEnd,
        0,
        0,
        0,
        0,
      ),
    );

    const ts = Math.floor(endPeriodDate.getTime() / 1000);

    const amount = formatUnits(BigInt(entry.amount), 18).toString();

    return {
      timestamp: ts,
      amount,
    };
  }

  private async getOnChainDataForChain(
    chainId: string,
  ): Promise<OnChainData[string]> {
    const publicClient = this.rpcProvider.getClient(chainId);

    if (!publicClient)
      throw new Error(
        `Can't get onchain data for ${this.dao.name}-${this.dao.symbol}. RPC client not found`,
      );

    const SECONDS_IN_WEEK = 60 * 60 * 24 * 7;
    const SECONDS_IN_YEAR = 60 * 60 * 24 * 365;

    const currentTimestamp = now();

    const timestamp =
      Math.floor(currentTimestamp / SECONDS_IN_WEEK + 1) * SECONDS_IN_WEEK;

    const totalStaked = await this.getXSTBLTotalSupply(publicClient);

    const units = await this.getUnitsRevenue(publicClient);

    const staked = Number(formatUnits(totalStaked ?? 0n, 18));

    const parsedPendingRevenue = this.pendingRevenue(units);

    const timePassed = currentTimestamp - (timestamp - SECONDS_IN_WEEK);

    const APR =
      (parsedPendingRevenue / staked) * (SECONDS_IN_YEAR / timePassed) * 100;

    const unitsFormatted = Object.entries(units).reduce((acc, [key, value]) => {
      acc[key] = {
        pendingRevenue: formatUnits(value.pendingRevenue, 18),
      };
      return acc;
    }, {});

    return {
      staked,
      stakingAPR: APR,
      units: unitsFormatted,
    };
  }

  private pendingRevenue(units: RawUnitsData): number {
    const value = Object.values(units).reduce((acc, unit) => {
      acc += unit.pendingRevenue;
      return acc;
    }, 0n);

    return Number(formatUnits(value, 18));
  }

  private async getUnitsRevenue(
    publicClient: PublicClient,
  ): Promise<RawUnitsData> {
    const result: RawUnitsData = {};
    for (const unit of this.dao.units) {
      switch (unit.unitId) {
        case 'xstbl':
          result[unit.unitId] = {
            pendingRevenue: await this.getPendingRebase(publicClient),
          };
          break;
        case 'stability:stabilityFarm':
          result[unit.unitId] = {
            pendingRevenue: await this.getPendingRevenue(publicClient),
          };
          break;
        case 'stability:stabilityMarket':
          result[unit.unitId] = {
            pendingRevenue: await this.getLendingRevenue(publicClient),
          };
          break;
        default:
          result[unit.unitId] = {
            pendingRevenue: 0n,
          };
      }
    }

    return result;
  }

  private async getPendingRebase(publicClient): Promise<bigint> {
    const chainId = publicClient.chain?.id;
    const xStblAddress = chainId
      ? (deployments[chainId].tokenomics.xSTBL as Address)
      : undefined;

    if (!xStblAddress) {
      return 0n;
    }

    return publicClient.readContract({
      abi: XSTBLAbi as Abi,
      address: xStblAddress,
      functionName: 'pendingRebase',
    }) as Promise<bigint>;
  }

  private async getPendingRevenue(publicClient: PublicClient): Promise<bigint> {
    const chainId = publicClient.chain?.id;
    const revenueRouterAddress = chainId
      ? deployments[chainId].tokenomics.revenueRouter
      : undefined;

    if (!revenueRouterAddress) return 0n;

    return publicClient.readContract({
      abi: RevenueRouterABI as Abi,
      address: revenueRouterAddress,
      functionName: 'pendingRevenue',
    }) as Promise<bigint>;
  }

  private async getXSTBLTotalSupply(
    publicClient: PublicClient,
  ): Promise<bigint> {
    const chainId = publicClient.chain?.id;

    const xStblAddress = chainId
      ? (deployments[chainId].tokenomics.xSTBL as Address)
      : undefined;

    if (!xStblAddress) {
      return 0n;
    }
    return publicClient.readContract({
      abi: XSTBLAbi as Abi,
      address: xStblAddress,
      functionName: 'totalSupply',
    }) as Promise<bigint>;
  }

  private async getLendingRevenue(publicClient: PublicClient): Promise<bigint> {
    const chainId = publicClient.chain?.id;
    const revenueRouterAddress = chainId
      ? deployments[chainId].tokenomics.revenueRouter
      : undefined;

    if (!revenueRouterAddress) {
      return 0n;
    }

    return publicClient.readContract({
      abi: RevenueRouterABI as Abi,
      address: revenueRouterAddress,
      functionName: 'pendingRevenue',
      args: [0n],
    }) as Promise<bigint>;
  }

  private getChains() {
    return Object.keys(this.dao.deployments);
  }
}
