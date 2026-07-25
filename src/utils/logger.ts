/**
 * Structured Logging Module
 * Request/response logging with metrics
 */

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  service: string;
  method: string;
  path: string;
  status?: number;
  duration?: number;
  error?: string;
  accountId?: string;
  model?: string;
  message: string;
}

export interface RequestMetrics {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  averageResponseTime: number;
  lastHourRequests: number;
}

export class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private metrics: Map<string, RequestMetrics> = new Map();

  log(entry: LogEntry): void {
    // Add timestamp if not present
    if (!entry.timestamp) {
      entry.timestamp = new Date().toISOString();
    }

    this.logs.push(entry);

    // Keep only last N logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Console output for INFO and above
    if (entry.level !== 'DEBUG') {
      console.log(`[${entry.timestamp}] ${entry.level} - ${entry.message}`);
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log({ level: 'INFO', message, service: 'kiro-edge', method: 'N/A', path: 'N/A', ...meta } as LogEntry);
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.log({
      level: 'ERROR',
      message,
      error: error?.message,
      service: 'kiro-edge',
      method: 'N/A',
      path: 'N/A',
      ...meta,
    } as LogEntry);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log({ level: 'WARN', message, service: 'kiro-edge', method: 'N/A', path: 'N/A', ...meta } as LogEntry);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log({ level: 'DEBUG', message, service: 'kiro-edge', method: 'N/A', path: 'N/A', ...meta } as LogEntry);
  }

  /**
   * Log HTTP request
   */
  logRequest(method: string, path: string, status: number, duration: number, accountId?: string, error?: string): void {
    this.log({
      level: status >= 400 ? 'ERROR' : 'INFO',
      message: `${method} ${path} - ${status}`,
      method,
      path,
      status,
      duration,
      accountId,
      error,
      service: 'kiro-edge',
      timestamp: new Date().toISOString(),
    });

    // Update metrics
    this.updateMetrics(accountId || 'default', status, duration);
  }

  /**
   * Update metrics
   */
  private updateMetrics(key: string, status: number, duration: number): void {
    const current = this.metrics.get(key) || {
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      averageResponseTime: 0,
      lastHourRequests: 0,
    };

    current.totalRequests++;
    current.lastHourRequests++;

    if (status < 400) {
      current.successCount++;
    } else {
      current.errorCount++;
    }

    // Calculate average response time
    current.averageResponseTime = (current.averageResponseTime * (current.totalRequests - 1) + duration) / current.totalRequests;

    this.metrics.set(key, current);
  }

  /**
   * Get metrics
   */
  getMetrics(key?: string): RequestMetrics | Map<string, RequestMetrics> {
    if (key) {
      return this.metrics.get(key) || { totalRequests: 0, successCount: 0, errorCount: 0, averageResponseTime: 0, lastHourRequests: 0 };
    }
    return this.metrics;
  }

  /**
   * Get recent logs
   */
  getLogs(limit: number = 100): LogEntry[] {
    return this.logs.slice(-limit);
  }

  /**
   * Get logs by level
   */
  getLogsByLevel(level: LogEntry['level'], limit: number = 50): LogEntry[] {
    return this.logs.filter((log) => log.level === level).slice(-limit);
  }

  /**
   * Clear logs
   */
  clear(): void {
    this.logs = [];
    this.metrics.clear();
  }
}

export const logger = new Logger();
