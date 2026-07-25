/**
 * Request History Module
 * Stores request/response history with KV support
 */

export interface HistoryEntry {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  model: string;
  accountId: string;
  status: number;
  duration: number;
  inputTokens?: number;
  outputTokens?: number;
  cached: boolean;
  error?: string;
}

export interface HistoryQuery {
  limit?: number;
  offset?: number;
  accountId?: string;
  model?: string;
  startDate?: string;
  endDate?: string;
  status?: number;
}

export class HistoryManager {
  private entries: HistoryEntry[] = [];
  private maxEntries = 5000;

  /**
   * Add history entry
   */
  addEntry(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): string {
    const id = this.generateId();
    const fullEntry: HistoryEntry = {
      ...entry,
      id,
      timestamp: new Date().toISOString(),
    };

    this.entries.push(fullEntry);

    // Keep only latest entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    return id;
  }

  /**
   * Query history
   */
  query(filters: HistoryQuery): HistoryEntry[] {
    let results = [...this.entries];

    if (filters.accountId) {
      results = results.filter((e) => e.accountId === filters.accountId);
    }

    if (filters.model) {
      results = results.filter((e) => e.model === filters.model);
    }

    if (filters.status) {
      results = results.filter((e) => e.status === filters.status);
    }

    if (filters.startDate) {
      const start = new Date(filters.startDate);
      results = results.filter((e) => new Date(e.timestamp) >= start);
    }

    if (filters.endDate) {
      const end = new Date(filters.endDate);
      results = results.filter((e) => new Date(e.timestamp) <= end);
    }

    // Sort by timestamp descending
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    const offset = filters.offset || 0;
    const limit = filters.limit || 100;

    return results.slice(offset, offset + limit);
  }

  /**
   * Get entry by ID
   */
  getById(id: string): HistoryEntry | null {
    return this.entries.find((e) => e.id === id) || null;
  }

  /**
   * Get statistics
   */
  getStats(accountId?: string): {
    totalRequests: number;
    successRate: number;
    avgDuration: number;
    errorCount: number;
    cachedRequests: number;
    totalTokens: number;
  } {
    let filtered = this.entries;

    if (accountId) {
      filtered = filtered.filter((e) => e.accountId === accountId);
    }

    const successCount = filtered.filter((e) => e.status === 200).length;
    const errorCount = filtered.filter((e) => e.status >= 400).length;
    const cachedCount = filtered.filter((e) => e.cached).length;

    const totalDuration = filtered.reduce((sum, e) => sum + e.duration, 0);
    const totalTokens = filtered.reduce((sum, e) => sum + (e.inputTokens || 0) + (e.outputTokens || 0), 0);

    return {
      totalRequests: filtered.length,
      successRate: filtered.length > 0 ? (successCount / filtered.length) * 100 : 0,
      avgDuration: filtered.length > 0 ? totalDuration / filtered.length : 0,
      errorCount,
      cachedRequests: cachedCount,
      totalTokens,
    };
  }

  /**
   * Clear history
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Export history as JSON
   */
  export(): HistoryEntry[] {
    return JSON.parse(JSON.stringify(this.entries));
  }

  /**
   * Get recent entries
   */
  getRecent(limit: number = 100): HistoryEntry[] {
    return this.entries.slice(-limit).reverse();
  }
}

export const historyManager = new HistoryManager();
