import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers';
import { rateLimiter } from '../middlewares/rate-limiter';
import { logger } from '../utils/logger';
import { circuitBreaker, RateLimitError, formatErrorResponse } from './errors';
import type { Env } from './types';
import chatRoutes from '../modules/chat/chat.routes';
import adminRoutes from '../modules/admin/admin.routes';

const app = new Hono<{ Bindings: Env }>();

// Serve Web Admin static files
app.use('/admin/*', async (c, next) => {
  try {
    return await serveStatic({ root: './public' })(c, next);
  } catch (e: any) {
    if (e.message && e.message.includes('__STATIC_CONTENT')) return next();
    throw e;
  }
});
app.use('/public/*', async (c, next) => {
  try {
    return await serveStatic({ root: './public' })(c, next);
  } catch (e: any) {
    if (e.message && e.message.includes('__STATIC_CONTENT')) return next();
    throw e;
  }
});
app.get('/admin', (c) => c.redirect('/admin/index.html'));

// Middleware: Rate limiting and Logging
app.use('*', async (c, next) => {
  if (c.req.path.startsWith('/admin') || c.req.path.startsWith('/public')) {
    return next();
  }

  const startTime = Date.now();
  const clientIp = c.req.header('cf-connecting-ip') || 'unknown';
  const rateLimitKey = `ip:${clientIp}`;

  const limitCheck = await rateLimiter.checkLimit(rateLimitKey);
  if (!limitCheck.allowed) {
    logger.warn('Rate limit exceeded', { clientIp, retryAfter: limitCheck.retryAfter });
    return c.json(formatErrorResponse(new RateLimitError(limitCheck.retryAfter)), { status: 429 });
  }

  c.header('X-RateLimit-Limit', '100');
  c.header('X-RateLimit-Remaining', limitCheck.remaining.toString());

  try {
    await next();
  } finally {
    const duration = Date.now() - startTime;
    const status = c.res.status;
    logger.logRequest(c.req.method, c.req.path, status, duration, clientIp);
  }
});

// Mount feature routers
app.route('/v1', chatRoutes);
app.route('/admin/api', adminRoutes);

// Observability Endpoints
app.get('/metrics', (c) => {
  const metrics = logger.getMetrics();
  return c.json({
    service: 'Kiro Edge Proxy',
    timestamp: new Date().toISOString(),
    rateLimit: rateLimiter.getStatus('default'),
    circuitBreaker: circuitBreaker.getState(),
    metrics: Object.fromEntries(metrics as Map<string, unknown>),
  });
});

app.get('/logs', (c) => {
  const limit = parseInt(c.req.query('limit') || '100');
  const level = c.req.query('level') as any;
  const logs = level ? logger.getLogsByLevel(level, limit) : logger.getLogs(limit);
  return c.json({
    timestamp: new Date().toISOString(),
    count: logs.length,
    logs,
  });
});

app.get('/health', (c) => {
  const cbState = circuitBreaker.getState();
  const isHealthy = cbState.state === 'CLOSED';
  return c.json(
    {
      status: isHealthy ? 'healthy' : 'degraded',
      circuitBreaker: cbState,
      timestamp: new Date().toISOString(),
    },
    { status: isHealthy ? 200 : 503 },
  );
});

app.get('/', (c) =>
  c.json({
    service: 'Kiro Edge Proxy v2',
    status: 'online',
    version: '2.0',
    features: ['rate-limiting', 'logging', 'validation', 'error-handling', 'circuit-breaker'],
  }),
);

// Global Error handling
app.onError((err, c) => {
  logger.error('Unhandled error', err instanceof Error ? err : new Error(String(err)));
  return c.json(formatErrorResponse(err instanceof Error ? err : new Error('Internal server error')), { status: 500 });
});

export default app;
