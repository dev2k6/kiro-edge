import type { Context } from 'hono';
import { AccountPool } from '../account/pool.service';
import { handleProxyRequest } from './chat.service';
import { validator } from '../../utils/validator';
import { circuitBreaker, RateLimitError, ValidationError, formatErrorResponse } from '../../core/errors';
import { logger } from '../../utils/logger';

export const handleChatCompletions = async (c: Context) => {
  try {
    const body = await c.req.json();
    const validation = validator.validateChatCompletion(body);
    if (!validation.valid) {
      return c.json(formatErrorResponse(new ValidationError('Invalid request', { errors: validation.errors })), { status: 400 });
    }

    if (!circuitBreaker.canExecute()) {
      return c.json(formatErrorResponse(new Error('Service temporarily unavailable')), { status: 503 });
    }

    const pool = new AccountPool(c.env as any);
    const response = await handleProxyRequest(c, pool, 'openai');

    if (response.status >= 500) {
      circuitBreaker.recordFailure();
    } else {
      circuitBreaker.recordSuccess();
    }
    return response;
  } catch (error) {
    circuitBreaker.recordFailure();
    logger.error('Chat completion error', error instanceof Error ? error : new Error(String(error)));
    return c.json(formatErrorResponse(error instanceof Error ? error : new Error('Unknown error')), { status: 500 });
  }
};

export const handleMessages = async (c: Context) => {
  try {
    const body = await c.req.json();
    const validation = validator.validateMessages(body);
    if (!validation.valid) {
      return c.json(formatErrorResponse(new ValidationError('Invalid request', { errors: validation.errors })), { status: 400 });
    }

    if (!circuitBreaker.canExecute()) {
      return c.json(formatErrorResponse(new Error('Service temporarily unavailable')), { status: 503 });
    }

    const pool = new AccountPool(c.env as any);
    const response = await handleProxyRequest(c, pool, 'claude');

    if (response.status >= 500) {
      circuitBreaker.recordFailure();
    } else {
      circuitBreaker.recordSuccess();
    }
    return response;
  } catch (error) {
    circuitBreaker.recordFailure();
    logger.error('Messages error', error instanceof Error ? error : new Error(String(error)));
    return c.json(formatErrorResponse(error instanceof Error ? error : new Error('Unknown error')), { status: 500 });
  }
};
