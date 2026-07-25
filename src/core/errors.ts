/**
 * Advanced Error Handling
 * Custom error types and circuit breaker
 */

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(400, 'VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends ApiError {
  constructor(retryAfter: number) {
    super(429, 'RATE_LIMIT_EXCEEDED', `Rate limit exceeded. Retry after ${retryAfter}s`, { retryAfter });
    this.name = 'RateLimitError';
  }
}

export class AuthError extends ApiError {
  constructor(message: string = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', message);
    this.name = 'AuthError';
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class ProxyError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(502, 'PROXY_ERROR', message, details);
    this.name = 'ProxyError';
  }
}

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  resetTimeout: number; // ms to wait before attempting reset
  monitorInterval: number; // ms between health checks
}

export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: config?.failureThreshold ?? 5,
      resetTimeout: config?.resetTimeout ?? 30000,
      monitorInterval: config?.monitorInterval ?? 5000,
    };
  }

  /**
   * Check if request can proceed
   */
  canExecute(): boolean {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      // Check if reset timeout has passed
      if (Date.now() - this.lastFailureTime > this.config.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        return true;
      }
      return false;
    }

    // HALF_OPEN state
    return true;
  }

  /**
   * Record success
   */
  recordSuccess(): void {
    this.failureCount = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 2) {
        this.state = 'CLOSED';
        this.successCount = 0;
      }
    }
  }

  /**
   * Record failure
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  /**
   * Get current state
   */
  getState(): { state: string; failureCount: number; lastFailureTime: number } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }
}

export const circuitBreaker = new CircuitBreaker({ failureThreshold: 5, resetTimeout: 30000 });

/**
 * Error response formatter
 */
export function formatErrorResponse(error: Error | ApiError): Record<string, unknown> {
  if (error instanceof ApiError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        status: error.statusCode,
        details: error.details,
      },
    };
  }

  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: error.message || 'Internal server error',
      status: 500,
    },
  };
}
