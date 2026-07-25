import type { Account, Env } from '../../core/types';

let cachedAccounts: Account[] = [];
let lastFetchTime = 0;
const CACHE_TTL = 30 * 1000; // 30s cache in worker memory

export class AccountPool {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  async loadAccounts(): Promise<Account[]> {
    const now = Date.now();
    if (cachedAccounts.length > 0 && (now - lastFetchTime) < CACHE_TTL) {
      return cachedAccounts;
    }

    // 1. Try loading from Cloudflare KV
    if (this.env.KIRO_KV) {
      try {
        const data = await this.env.KIRO_KV.get('accounts', 'json');
        if (data && Array.isArray(data)) {
          cachedAccounts = data as Account[];
          lastFetchTime = now;
          return cachedAccounts;
        }
      } catch (err) {
        console.error("Failed to load accounts from KV:", err);
      }
    }

    // 2. Fallback to ACCOUNTS_JSON environment variable
    const processEnv = (globalThis as any).process?.env;
    const accountsJson = this.env.ACCOUNTS_JSON || (processEnv ? processEnv.ACCOUNTS_JSON : null);
    if (accountsJson) {
      try {
        const parsed = JSON.parse(accountsJson);
        if (Array.isArray(parsed)) {
          cachedAccounts = parsed as Account[];
          lastFetchTime = now;
          return cachedAccounts;
        }
      } catch (err) {
        console.error("Failed to parse ACCOUNTS_JSON env variable:", err);
      }
    }

    // 3. Fallback dummy demo account for testing local serverless execution
    return [
      {
        id: 'demo-account',
        accessToken: 'dummy-token',
        refreshToken: 'dummy-refresh-token',
        authMethod: 'api_key',
        kiroApiKey: 'ksk_demo_key',
        enabled: true
      }
    ];
  }

  async getNext(model: string = ""): Promise<Account | null> {
    const accounts = await this.loadAccounts();
    const active = accounts.filter(a => a.enabled && a.banStatus !== "BANNED" && a.banStatus !== "SUSPENDED");

    if (active.length === 0) return null;

    // Weighted random selection based on weight
    const totalWeight = active.reduce((sum, a) => sum + (a.weight || 1), 0);
    let randomNum = Math.random() * totalWeight;

    for (const acc of active) {
      const weight = acc.weight || 1;
      if (randomNum < weight) {
        return acc;
      }
      randomNum -= weight;
    }

    return active[0];
  }

  async getAll(): Promise<Account[]> {
    return this.loadAccounts();
  }

  updateCache(accounts: Account[]) {
    cachedAccounts = accounts;
    lastFetchTime = Date.now();
  }

  async disableAccount(accountId: string, reason: string) {
    const current = await this.getAll();
    const updated = current.map(a => {
      if (a.id === accountId) {
        return { ...a, enabled: false, banStatus: "BANNED", banReason: reason };
      }
      return a;
    });
    if (this.env.KIRO_KV) {
      await this.env.KIRO_KV.put('accounts', JSON.stringify(updated));
    }
    this.updateCache(updated);
  }
}
