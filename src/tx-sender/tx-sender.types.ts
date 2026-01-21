import { SimulateContractParameters } from 'viem';

export type Transaction = {
  id: string;
  type: TransactionType;
  chainId: string;
  retries: number;
  data: SimulateContractParameters;
};

export type SentTransactionResult = {
  hash: string;
  spent: string;
};

export enum TransactionType {
  UPDATE_PERIOD = 'update-period',
  UPDATE_OTHER_CHAINS_POWERS = 'update-other-chains-powers',
}

export interface TransactionReport {
  hash: string;
  chainId: number;
  type: string;
  id: string;
  gasSpent: string;
  timestamp: Date;
  status: 'success' | 'failed';
  errorMessage?: string;
  retries?: number;
}

export interface ChainReport {
  chainId: number;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  totalGasSpent: string;
  lastUpdated: Date;
  transactions: TransactionReport[];
}
