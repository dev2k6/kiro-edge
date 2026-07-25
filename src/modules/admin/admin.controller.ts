import type { Context } from 'hono';
import type { AccountPool } from '../account/pool.service';
import type { Account } from '../../core/types';

export interface Settings {
  adminPassword?: string;
  logLevel?: string;
  allowOverUsage?: boolean;
  thinkingSuffix?: string;
}

const startTime = Date.now();

let currentSettings: Settings = {
  adminPassword: 'changeme',
  logLevel: 'info',
  allowOverUsage: false,
  thinkingSuffix: '-thinking'
};

export function getAdminStatus(c: Context, pool: AccountPool) {
  return c.json({
    status: "ok",
    version: "1.0.0-edge",
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString()
  });
}

export function getSettings(c: Context) {
  return c.json(currentSettings);
}

export async function updateSettings(c: Context) {
  try {
    const body = await c.req.json();
    currentSettings = { ...currentSettings, ...body };
    return c.json({ success: true, settings: currentSettings });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
}

export async function getAccounts(c: Context, pool: AccountPool) {
  const accounts = await pool.getAll();
  return c.json(accounts);
}

export async function addAccount(c: Context, pool: AccountPool) {
  try {
    const account = await c.req.json();
    if (!account.id) {
      account.id = `acc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    }
    account.enabled = account.enabled !== false;
    
    // In Edge KV mode, accounts can be written to KV if bound
    if (c.env.KIRO_KV) {
      const current = await pool.getAll();
      current.push(account);
      await c.env.KIRO_KV.put('accounts', JSON.stringify(current));
      pool.updateCache(current); // Fix: sync cache immediately
    }
    
    return c.json({ success: true, account });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
}

export async function deleteAccount(c: Context, pool: AccountPool, accountId: string) {
  if (c.env.KIRO_KV) {
    const current = await pool.getAll();
    const filtered = current.filter((a: Account) => a.id !== accountId);

    if (current.length === filtered.length) {
        return c.json({ error: 'Account not found' }, 404);
    }
    await c.env.KIRO_KV.put('accounts', JSON.stringify(filtered));
    pool.updateCache(filtered); // Fix: sync cache immediately
  }
  return c.json({ success: true, deleted: accountId });
}
