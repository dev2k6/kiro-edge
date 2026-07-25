/**
 * Response Caching Module
 * Caches responses with TTL using Cloudflare Cache API
 */

export interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
  hits: number;
  size: number;
}

export interface CacheConfig {
  defaultTtl: number; // seconds
  maxEntries: number;
}

export class CacheManager {
  private cache = new Map<string, CacheEntry>();
  private config: CacheConfig;

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      defaultTtl: config?.defaultTtl ?? 300, // 5 min default
      maxEntries: config?.maxEntries ?? 1000,
    };
  }

  /**
   * Generate cache key from request
   */
  generateKey(method: string, path: string, model: string, accountId: string): string {
    return `${method}:${path}:${model}:${accountId}`;
  }

  /**
   * Get cached response
   */
  get(key: string): { data: any; hit: boolean } | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl * 1000) {
      this.cache.delete(key);
      return null;
    }

    entry.hits++;
    return { data: entry.data, hit: true };
  }

  /**
   * Cache response
   */
  set(key: string, data: any, ttl?: number): void {
    // Check size limit
    if (this.cache.size >= this.config.maxEntries) {
      // Remove oldest entry
      const oldest = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp,
      )[0];
      if (oldest) {
        this.cache.delete(oldest[0]);
      }
    }

    const estimatedSize = JSON.stringify(data).length;
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? this.config.defaultTtl,
      hits: 0,
      size: estimatedSize,
    });
  }

  /**
   * Check if response is cacheable
   */
  isCacheable(status: number, method: string, headers?: Record<string, string>): boolean {
    // Only cache GET/HEAD requests with 200 status
    if (!['GET', 'HEAD'].includes(method)) {
      return false;
    }

    if (status !== 200) {
      return false;
    }

    // Check Cache-Control header
    if (headers?.['cache-control']?.includes('no-cache')) {
      return false;
    }

    return true;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    entries: number;
    totalHits: number;
    totalSize: number;
    avgHits: number;
  } {
    let totalHits = 0;
    let totalSize = 0;

    for (const entry of this.cache.values()) {
      totalHits += entry.hits;
      totalSize += entry.size;
    }

    return {
      entries: this.cache.size,
      totalHits,
      totalSize,
      avgHits: this.cache.size > 0 ? totalHits / this.cache.size : 0,
    };
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clear expired entries
   */
  cleanup(): void {
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl * 1000) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache entry details
   */
  getEntry(key: string): CacheEntry | null {
    return this.cache.get(key) || null;
  }
}

export const cacheManager = new CacheManager({ defaultTtl: 300, maxEntries: 1000 });
