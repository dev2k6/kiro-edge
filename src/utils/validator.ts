/**
 * Request Validation Module
 * Schema validation and input sanitization
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized?: Record<string, unknown>;
}

export class RequestValidator {
  private validModels = [
    'gpt-4o',
    'gpt-4o-mini',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
  ];

  private maxMessageLength = 32000;
  private maxMessages = 100;

  /**
   * Validate chat completion request
   */
  validateChatCompletion(body: any): ValidationResult {
    const errors: string[] = [];

    // Check model
    if (!body.model) {
      errors.push('model is required');
    } else if (!this.validModels.includes(body.model)) {
      errors.push(`model must be one of: ${this.validModels.join(', ')}`);
    }

    // Check messages
    if (!Array.isArray(body.messages)) {
      errors.push('messages must be an array');
    } else if (body.messages.length === 0) {
      errors.push('messages cannot be empty');
    } else if (body.messages.length > this.maxMessages) {
      errors.push(`messages cannot exceed ${this.maxMessages} items`);
    } else {
      // Validate each message
      body.messages.forEach((msg: any, idx: number) => {
        if (!msg.role) {
          errors.push(`messages[${idx}].role is required`);
        }
        if (!msg.content) {
          errors.push(`messages[${idx}].content is required`);
        } else if (typeof msg.content !== 'string') {
          errors.push(`messages[${idx}].content must be string`);
        } else if (msg.content.length > this.maxMessageLength) {
          errors.push(`messages[${idx}].content exceeds max length ${this.maxMessageLength}`);
        }
      });
    }

    // Check optional params
    if (body.temperature !== undefined && (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 2)) {
      errors.push('temperature must be between 0 and 2');
    }

    if (body.max_tokens !== undefined && (typeof body.max_tokens !== 'number' || body.max_tokens < 1)) {
      errors.push('max_tokens must be positive integer');
    }

    if (body.stream !== undefined && typeof body.stream !== 'boolean') {
      errors.push('stream must be boolean');
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: errors.length === 0 ? this.sanitizeRequest(body) : undefined,
    };
  }

  /**
   * Validate messages (Claude) request
   */
  validateMessages(body: any): ValidationResult {
    const errors: string[] = [];

    // Check model
    if (!body.model) {
      errors.push('model is required');
    } else if (!this.validModels.includes(body.model)) {
      errors.push(`model must be one of: ${this.validModels.join(', ')}`);
    }

    // Check messages
    if (!Array.isArray(body.messages)) {
      errors.push('messages must be an array');
    } else if (body.messages.length === 0) {
      errors.push('messages cannot be empty');
    } else if (body.messages.length > this.maxMessages) {
      errors.push(`messages cannot exceed ${this.maxMessages} items`);
    } else {
      body.messages.forEach((msg: any, idx: number) => {
        if (!msg.role) {
          errors.push(`messages[${idx}].role is required`);
        }
        if (!msg.content) {
          errors.push(`messages[${idx}].content is required`);
        } else if (typeof msg.content !== 'string' && !Array.isArray(msg.content)) {
          errors.push(`messages[${idx}].content must be string or array`);
        }
      });
    }

    // Check max_tokens
    if (!body.max_tokens || typeof body.max_tokens !== 'number' || body.max_tokens < 1) {
      errors.push('max_tokens is required and must be positive integer');
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: errors.length === 0 ? this.sanitizeRequest(body) : undefined,
    };
  }

  /**
   * Sanitize request
   */
  private sanitizeRequest(body: any): Record<string, unknown> {
    return {
      model: body.model,
      messages: body.messages.map((m: any) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content.slice(0, this.maxMessageLength) : m.content,
      })),
      temperature: body.temperature ?? 0.7,
      max_tokens: body.max_tokens,
      stream: body.stream ?? false,
      top_p: body.top_p ?? 1,
      top_k: body.top_k,
      stop: body.stop,
    };
  }

  /**
   * Validate API key
   */
  validateApiKey(key: string): boolean {
    if (!key) return false;
    if (key.length < 10) return false;
    return true;
  }

  /**
   * Validate account ID
   */
  validateAccountId(id: string): boolean {
    if (!id) return false;
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) return false;
    return true;
  }
}

export const validator = new RequestValidator();
