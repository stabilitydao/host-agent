import { Injectable } from '@nestjs/common';
import { RevenueChart } from '@stabilitydao/host/out/api';
import { ContractIndices, IDAOData } from '@stabilitydao/host/out/host';
import { Abi, erc20Abi, PublicClient } from 'viem';
import { formatUnits } from 'viem/utils';
import RevenueRouterABI from '../../../abi/RevenueRouterABI';
import XSTBLAbi from '../../../abi/XSTBLABI';
import { RpcService } from '../../rpc/rpc.service';
import { SubgraphService } from '../../subgraph/subgraph.service';
import { now } from '../../utils/now';
import { DaoService } from '../abstract-dao';
import { OnChainData, UnitData } from '../types/dao';
import { XStakingNotifyRewardEntity } from '../types/xStakign';
import { isLive } from '../utils';
import { AnalyticsService } from 'src/analytics/analytics.service';

@Injectable()
export class STBlDao extends DaoService {
  public static symbol = 'STBL';
  private isLive: boolean;

  constructor(
    dao: IDAOData,
    subgraphProvider: SubgraphService,
    rpcProvider: RpcService,
    analyticsService: AnalyticsService,
  ) {
    if (dao.symbol != STBlDao.symbol)
      throw new Error(
        `Failed to initialize STBL DAO service. Expected ${STBlDao.symbol}, got ${dao.symbol}`,
      );

    super(dao, subgraphProvider, rpcProvider, analyticsService);

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
    const publicClient = this.rpcProvider.getPublicClient(chainId);

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

    const totalRevenue = Object.values(units).reduce(
      (acc, value) =>
        acc + value.reduce((acc, value) => acc + value.pendingRevenueUSD, 0),
      0,
    );

    const timePassed = currentTimestamp - (timestamp - SECONDS_IN_WEEK);

    const APR = (totalRevenue / staked) * (SECONDS_IN_YEAR / timePassed) * 100;

    return {
      staked: staked,
      stakingAPR: APR,
      units,
    };
  }

  private async getUnitsRevenue(publicClient: PublicClient): Promise<UnitData> {
    const chainId = publicClient.chain?.id;
    if (!chainId) return {};

    const xstblAddress =
      this.dao.deployments[chainId][ContractIndices.X_TOKEN_4];

    if (!xstblAddress) return {};

    const result: UnitData = {};
    const xstblTokenSymbol = await publicClient.readContract({
      abi: erc20Abi,
      functionName: 'symbol',
      address: xstblAddress,
    });

    const xStblDecimals = await publicClient.readContract({
      abi: erc20Abi,
      functionName: 'decimals',
      address: xstblAddress,
    });

    const xstblPrice = this.analyticsService.getxStblPrice();

    for (const unit of this.dao.units) {
      switch (unit.unitId) {
        case 'xstbl': {
          const revenue = await this.getPendingRebase(publicClient);
          result[unit.unitId] = [
            {
              pendingRevenueAssetAddress: xstblAddress,
              pendingRevenueAssetAmount: Number(
                formatUnits(revenue, xStblDecimals),
              ),
              pendingRevenueAssetSymbol: xstblTokenSymbol,
              pendingRevenueUSD:
                xstblPrice * Number(formatUnits(revenue, xStblDecimals)),
            },
          ];
          break;
        }
        case 'stability:stabilityFarm': {
          switch (chainId) {
            case 9745:
              result[unit.unitId] =
                await this.getPendingAssetsRevenue(publicClient);
              break;
            default:
              const revenue = await this.getPendingRevenue(publicClient);
              result[unit.unitId] = [
                {
                  pendingRevenueAssetAddress: xstblAddress,
                  pendingRevenueAssetAmount: Number(
                    formatUnits(revenue, xStblDecimals),
                  ),
                  pendingRevenueAssetSymbol: xstblTokenSymbol,
                  pendingRevenueUSD:
                    xstblPrice * Number(formatUnits(revenue, xStblDecimals)),
                },
              ];
          }

          break;
        }
        case 'stability:stabilityMarket':
          const revenue = await this.getLendingRevenue(publicClient);
          result[unit.unitId] = [
            {
              pendingRevenueAssetAddress: xstblAddress,
              pendingRevenueAssetAmount: Number(
                formatUnits(revenue, xStblDecimals),
              ),
              pendingRevenueAssetSymbol: xstblTokenSymbol,
              pendingRevenueUSD:
                xstblPrice * Number(formatUnits(revenue, xStblDecimals)),
            },
          ];
          break;
        default:
          result[unit.unitId] = [];
      }
    }

    return result;
  }

  private async getPendingRebase(publicClient): Promise<bigint> {
    const chainId = publicClient.chain?.id;
    const xStblAddress = chainId
      ? this.dao.deployments[chainId][ContractIndices.X_TOKEN_4]
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
      ? this.dao.deployments[chainId][ContractIndices.REVENUE_ROUTER_21]
      : undefined;

    if (!revenueRouterAddress) return 0n;

    return publicClient
      .readContract({
        abi: RevenueRouterABI as Abi,
        address: revenueRouterAddress,
        functionName: 'pendingRevenue',
      })
      .catch(() => 0n) as Promise<bigint>;
  }

  private async getPendingAssetsRevenue(publicClient: PublicClient) {
    const chainId = publicClient.chain?.id;
    const revenueRouterAddress = chainId
      ? this.dao.deployments[chainId][ContractIndices.REVENUE_ROUTER_21]
      : undefined;

    if (!revenueRouterAddress) return [];

    const assets = (await publicClient
      .readContract({
        abi: RevenueRouterABI as Abi,
        address: revenueRouterAddress,
        functionName: 'pendingRevenueAssets',
      })
      .catch(() => [])) as `0x${string}`[];

    const pendingAssetsRevenue = (await publicClient.multicall({
      contracts: assets.map((asset) => ({
        abi: RevenueRouterABI as Abi,
        address: revenueRouterAddress,
        functionName: 'pendingRevenueAsset',
        args: [asset],
      })),
    })) as { result: bigint }[];

    const symbols = (await publicClient
      .multicall({
        contracts: assets.map((asset) => ({
          abi: erc20Abi,
          address: asset,
          functionName: 'symbol',
        })),
      })
      .then((res) => res.map((r) => r.result))) as string;

    const decimals = await publicClient
      .multicall({
        contracts: assets.map((asset) => ({
          abi: erc20Abi,
          address: asset,
          functionName: 'decimals',
        })),
      })
      .then((res) => res.map((r) => Number(r.result ?? 0)));

    return pendingAssetsRevenue.map((r, i) => ({
      pendingRevenueAssetAddress: assets[i],
      pendingRevenueAssetAmount: Number(formatUnits(r.result, decimals[i])),
      pendingRevenueAssetSymbol: symbols[i],
      pendingRevenueUSD:
        this.analyticsService.getPriceBySymbol(symbols[i]) *
        Number(formatUnits(r.result, decimals[i])),
    }));
  }

  private async getXSTBLTotalSupply(
    publicClient: PublicClient,
  ): Promise<bigint> {
    const chainId = publicClient.chain?.id;

    const xStblAddress = chainId
      ? this.dao.deployments[chainId][ContractIndices.X_TOKEN_4]
      : undefined;

    if (!xStblAddress) {
      return 0n;
    }
    return publicClient
      .readContract({
        abi: XSTBLAbi as Abi,
        address: xStblAddress,
        functionName: 'totalSupply',
      })
      .catch(() => 0n) as Promise<bigint>;
  }

  private async getLendingRevenue(publicClient: PublicClient): Promise<bigint> {
    const chainId = publicClient.chain?.id;
    const revenueRouterAddress = chainId
      ? this.dao.deployments[chainId][ContractIndices.REVENUE_ROUTER_21]
      : undefined;

    if (!revenueRouterAddress) {
      return 0n;
    }

    return publicClient
      .readContract({
        abi: RevenueRouterABI as Abi,
        address: revenueRouterAddress,
        functionName: 'pendingRevenue',
        args: [0n],
      })
      .catch(() => 0n) as Promise<bigint>;
  }

  private getChains() {
    return Object.keys(this.dao.deployments);
  }
}
