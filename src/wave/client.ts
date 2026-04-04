import { config } from '../utils/config';
import { logger } from '../utils/logger';
import type { WaveTransaction, WaveAccount, WaveCreateTransactionResult } from './types';

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export class WaveClient {
  private readonly headers: Record<string, string>;

  constructor() {
    this.headers = {
      'Authorization': `Bearer ${config.wave.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  private async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(config.wave.apiUrl, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Wave API HTTP error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json() as GraphQLResponse<T>;

    if (result.errors?.length) {
      throw new Error(`Wave API error: ${result.errors.map(e => e.message).join(', ')}`);
    }

    if (!result.data) {
      throw new Error('Wave API returned no data');
    }

    return result.data;
  }

  async getAccounts(): Promise<WaveAccount[]> {
    const data = await this.query<{ business: { accounts: { edges: Array<{ node: WaveAccount }> } } }>(`
      query GetAccounts($businessId: ID!) {
        business(id: $businessId) {
          accounts(first: 100) {
            edges { node { id name type subtype normalBalanceType } }
          }
        }
      }
    `, { businessId: config.wave.businessId });

    return data.business.accounts.edges.map(e => e.node);
  }

  async createTransaction(transaction: WaveTransaction): Promise<WaveCreateTransactionResult> {
    logger.info(`Creating Wave transaction: ${transaction.externalId}`);
    // TODO: implement using Wave's moneyTransactionCreate mutation
    // Wave API reference: https://developer.waveapps.com/hc/en-us/articles/360019968212
    logger.warn('WaveClient.createTransaction not yet implemented');
    return { transaction, didCreate: false };
  }

  async transactionExists(externalId: string): Promise<boolean> {
    // TODO: implement — query by externalId to check for duplicates
    logger.warn('WaveClient.transactionExists not yet implemented');
    return false;
  }
}
