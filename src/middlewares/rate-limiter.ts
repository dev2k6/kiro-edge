/**
 * Rate Limiting Module
 * Implements token bucket algorithm for rate limiting
 */

export interface RateLimitConfig {
  tokensPerMinute: number;
  maxBurst: number;
}

export interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private defaultConfig: RateLimitConfig;

  constructor(tokensPerMinute: number = 100, maxBurst: number = 150) {
    this.defaultConfig = { tokensPerMinute, maxBurst };
  }

  /**
   * Check if request is allowed and consume tokens
   */
  async checkLimit(key: string): Promise<{ allowed: boolean; remaining: number; retryAfter: number }> {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: this.defaultConfig.maxBurst,
        lastRefill: now,
      };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on time elapsed
    const elapsedMs = now - bucket.lastRefill;
    const tokensToAdd = (elapsedMs / 60000) * this.defaultConfig.tokensPerMinute;
    bucket.tokens = Math.min(this.defaultConfig.maxBurst, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    // Check if request is allowed
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        retryAfter: 0,
      };
    }

    // Calculate retry-after
    const timeToRefill = (60000 / this.defaultConfig.tokensPerMinute) * (1 - bucket.tokens);
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil(timeToRefill / 1000),
    };
  }

  /**
   * Get rate limit status
   */
  getStatus(key: string): { tokens: number; max: number; perMinute: number } {
    const bucket = this.buckets.get(key);
    return {
      tokens: bucket ? Math.floor(bucket.tokens) : this.defaultConfig.maxBurst,
      max: this.defaultConfig.maxBurst,
      perMinute: this.defaultConfig.tokensPerMinute,
    };
  }

  /**
   * Reset bucket for a key
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Cleanup old buckets (older than 1 hour)
   */
  cleanup(): void {
    const now = Date.now();
    const oneHour = 3600000;

    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefill > oneHour) {
        this.buckets.delete(key);
      }
    }
  }
}

export const rateLimiter = new RateLimiter(100, 150);
