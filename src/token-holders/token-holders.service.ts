import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { daos, IDAOData } from '@stabilitydao/host';
import { ContractIndices } from '@stabilitydao/host/out/host';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { RpcService } from 'src/rpc/rpc.service';
import { Abi, formatUnits, getAddress } from 'viem';
import { TokenHolder } from './types';
import { ConfigService } from '@nestjs/config';
import { IDAOHolders } from '@stabilitydao/host/out/api';

interface TransferLog {
  address: `0x${string}`;
  topics: `0x${string}`[];
}

@Injectable()
export class TokenHoldersService {
  private readonly logger = new Logger(TokenHoldersService.name);
  private readonly stepByChain = {
    146: 200_000,
    9745: 10_000,
  };

  private readonly tempDir = './temp/token-holders';
  private readonly enabled: boolean;

  private readonly erc20ABI = [
    {
      name: 'balanceOf',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'owner', type: 'address' }],
      outputs: [{ type: 'uint256' }],
    },
    {
      name: 'decimals',
      type: 'function',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ type: 'uint8' }],
    },
  ];

  constructor(
    private readonly rpcService: RpcService,
    private readonly configService: ConfigService,
  ) {
    this.enabled =
      Boolean(this.configService.get('tokenHoldersParsingEnabled')) ?? false;
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleCron() {
    if (!this.enabled) return;
    await this.updateTokenHolders();
  }

  async updateTokenHolders() {
    for (const dao of daos) {
      await this.updateTokenHoldersForDao(dao);
    }
  }

  getTokenHoldersByChain(daoKey: string): Record<string, TokenHolder[]> {
    const holders = {};
    const dao = daos.find((dao) => dao.symbol === daoKey);
    if (!dao) return holders;
    const folder = path.join(this.tempDir, `${daoKey}`);
    for (const chainId in dao.deployments) {
      const chainFolder = path.join(folder, chainId);
      const filename = path.join(chainFolder, 'holders.json');
      if (!fs.existsSync(filename)) continue;
      const data = fs.readFileSync(filename, 'utf-8');
      const json = JSON.parse(data);
      holders[chainId] = json;
    }
    return holders;
  }

  getDaoTokenHolder(daoKey: string): IDAOHolders {
    const holdersByChain = this.getTokenHoldersByChain(daoKey);

    const holders = Object.values(holdersByChain).reduce<IDAOHolders>(
      (acc, holders) => {
        for (const holder of holders) {
          if (acc[holder.address]) {
            acc[holder.address].balance = (
              Number(acc[holder.address].balance) + Number(holder.balance)
            ).toString();
            continue;
          }
          acc[holder.address] = {
            address: holder.address as `0x${string}`,
            balance: Number(holder.balance).toString(),
          };
        }
        return acc;
      },
      {},
    );

    const total = Object.values(holders).reduce<number>((acc, holder) => {
      return acc + Number(holder.balance);
    }, 0);

    for (const holder of Object.values(holders)) {
      holder.percentage = ((Number(holder.balance) / total) * 100).toFixed(2);
    }

    return holders;
  }

  private async updateTokenHoldersForDao(dao: IDAOData) {
    for (const chainId in dao.deployments) {
      const deployments = dao.deployments[chainId];

      const daoToken = deployments?.[ContractIndices.DAO_TOKEN_5];

      if (!daoToken) continue;

      try {
        await this.updateForToken({
          daoKey: dao.symbol,
          chainId,
          tokenAddress: daoToken,
        });
      } catch (e: any) {
        this.logger.error(
          `[${chainId}] Failed to update token holders for DAO=${dao.symbol}`,
          e.stack,
        );
      }
    }
  }

  private async updateForToken(opts: {
    daoKey: string;
    chainId: string;
    tokenAddress: `0x${string}`;
  }) {
    this.logger.log(
      `[${opts.chainId}] Updating token holders for token=${opts.tokenAddress}`,
    );

    const { daoKey, chainId, tokenAddress } = opts;

    const client = this.rpcService.getPublicClient(chainId);

    if (!client) {
      this.logger.warn(`[${chainId}] No client found`);
      return;
    }

    const rpc = this.rpcService.getRpcUrl(chainId);

    if (!rpc) {
      this.logger.warn(`[${chainId}] No RPC found`);
      return;
    }

    const tempDir = this.tempDir;
    const baseDir = path.join(tempDir, daoKey, chainId);

    fs.mkdirSync(baseDir, { recursive: true });

    const stateFile = path.join(baseDir, 'state.json');
    const holdersFile = path.join(baseDir, 'holders.json');

    const latestBlock = await client.getBlockNumber();
    let fromBlock = 0;

    if (fs.existsSync(stateFile)) {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
      fromBlock = state.lastBlock + 1;
    }

    const previousHolders = fs.existsSync(holdersFile)
      ? JSON.parse(fs.readFileSync(holdersFile, 'utf-8')).map(
          (h: any) => h.address,
        )
      : [];

    this.logger.log(
      `[${daoKey}] ${chainId} ${tokenAddress} ${fromBlock} → ${latestBlock}`,
    );

    const step = this.stepByChain[chainId];
    const logs = await this.fetchTransferLogs({
      rpc,
      tokenAddress,
      step,
      from: fromBlock,
      to: Number(latestBlock),
    });

    const newHolders = this.parseTransferLogs(logs);
    const holders = [...new Set([...previousHolders, ...newHolders])];

    if (!holders.length) return;

    const decimals = (await client.readContract({
      address: tokenAddress,
      abi: this.erc20ABI,
      functionName: 'decimals',
    })) as number;

    const balances = await client.multicall({
      contracts: holders.map((addr) => ({
        address: tokenAddress,
        abi: this.erc20ABI as Abi,
        functionName: 'balanceOf',
        args: [addr],
      })),
    });

    const result = holders
      .map((address, i) => ({
        address,
        balance: formatUnits(balances[i].result as bigint, decimals),
      }))
      .filter((h) => Number(h.balance) > 0);

    const total = result.reduce((s, h) => s + Number(h.balance), 0);

    result.forEach((h) => {
      h['percentage'] = ((Number(h.balance) / total) * 100).toFixed(2);
    });

    result.sort((a, b) => Number(b.balance) - Number(a.balance));

    fs.writeFileSync(holdersFile, JSON.stringify(result, null, 2));
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ lastBlock: Number(latestBlock) }, null, 2),
    );

    this.logger.log(
      `Saved ${result.length} holders for ${daoKey} on ${chainId}`,
    );
  }

  private async fetchTransferLogs(opts: {
    rpc: string;
    tokenAddress: string;
    step: number;
    from: number;
    to: number;
  }): Promise<TransferLog[]> {
    const logs: TransferLog[] = [];

    for (let i = opts.from; i <= opts.to; i += opts.step) {
      const end = Math.min(i + opts.step - 1, opts.to);

      const cmd = [
        'cast logs',
        `--from-block ${i}`,
        `--to-block ${end}`,
        `--rpc-url ${opts.rpc}`,
        `"Transfer(address,address,uint256)"`,
        `--address ${opts.tokenAddress}`,
        '--json',
      ].join(' ');

      try {
        const raw = execSync(cmd, { encoding: 'utf-8' });
        logs.push(...JSON.parse(raw));
      } catch (e) {
        this.logger.warn(`Logs failed ${i} → ${end}`);
      }
    }

    return logs;
  }

  private parseTransferLogs(logs: TransferLog[]): `0x${string}`[] {
    const set = new Set<`0x${string}`>();
    const ZERO = '0x0000000000000000000000000000000000000000';

    for (const log of logs) {
      if (log.topics.length < 3) continue;

      try {
        const from = getAddress('0x' + log.topics[1].slice(26));
        const to = getAddress('0x' + log.topics[2].slice(26));

        if (from !== ZERO) set.add(from);
        if (to !== ZERO) set.add(to);
      } catch {}
    }

    return [...set];
  }
}
