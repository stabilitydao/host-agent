import { Account, SimulateContractParameters } from 'viem';

export type Transaction = {
  id: string;
  type: TransactionType;
  chainId: string;
  retries: number;
  data: SimulateContractParameters<any, any, any, any, any, Account>;
};

export type SentTransactionResult = {
  hash: string;
  spent: string;
  status: TransactionResult;
  error?: string;
};

export enum TransactionType {
  UPDATE_PERIOD = 'update-period',
  UPDATE_OTHER_CHAINS_POWERS = 'update-other-chains-powers',
}

export enum TransactionResult {
  SUCCESS = 'success',
  REVERTED = 'reverted',
  SENDING_ERROR = 'sending-error',
  SIMULATION_FAILED = 'simulation-failed',
  UNKNOWN = 'unknown',
}

export interface TransactionReport {
  hash: string;
  chainId: string;
  type: string;
  id: string;
  gasSpent: string;
  timestamp: Date;
  status: TransactionResult;
  errorMessage?: string;
  retries?: number;
}

export interface ChainReport {
  chainId: string;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  totalGasSpent: string;
  lastUpdated: Date;
  transactions: TransactionReport[];
}
