/**
 * Token Estimation Module
 * Estimates token counts for requests
 */

export interface TokenEstimate {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface ModelTokenConfig {
  inputCostPer1k: number;
  outputCostPer1k: number;
  avgInputTokens: number;
  avgOutputTokens: number;
}

export class TokenEstimator {
  private modelConfigs: Map<string, ModelTokenConfig> = new Map([
    [
      'gpt-4o',
      {
        inputCostPer1k: 0.005,
        outputCostPer1k: 0.015,
        avgInputTokens: 1500,
        avgOutputTokens: 800,
      },
    ],
    [
      'gpt-4o-mini',
      {
        inputCostPer1k: 0.00015,
        outputCostPer1k: 0.0006,
        avgInputTokens: 1500,
        avgOutputTokens: 800,
      },
    ],
    [
      'claude-3-5-sonnet-20241022',
      {
        inputCostPer1k: 0.003,
        outputCostPer1k: 0.015,
        avgInputTokens: 2000,
        avgOutputTokens: 1000,
      },
    ],
    [
      'claude-3-5-haiku-20241022',
      {
        inputCostPer1k: 0.00008,
        outputCostPer1k: 0.0004,
        avgInputTokens: 2000,
        avgOutputTokens: 1000,
      },
    ],
    [
      'claude-3-opus-20240229',
      {
        inputCostPer1k: 0.015,
        outputCostPer1k: 0.075,
        avgInputTokens: 2000,
        avgOutputTokens: 1000,
      },
    ],
  ]);

  /**
   * Estimate tokens for request
   */
  estimate(model: string, messages: any[], maxTokens?: number): TokenEstimate {
    const config = this.modelConfigs.get(model);

    if (!config) {
      throw new Error(`Unknown model: ${model}`);
    }

    // Simple token estimation: ~4 characters per token
    let inputTokens = 0;
    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      inputTokens += Math.ceil(content.length / 4);
    }

    // Add metadata overhead
    inputTokens += messages.length * 10;

    // Estimate output tokens
    const outputTokens = maxTokens ? Math.min(maxTokens, config.avgOutputTokens) : config.avgOutputTokens;

    // Calculate cost
    const inputCost = (inputTokens / 1000) * config.inputCostPer1k;
    const outputCost = (outputTokens / 1000) * config.outputCostPer1k;
    const totalCost = inputCost + outputCost;

    return {
      model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCost: parseFloat(totalCost.toFixed(6)),
    };
  }

  /**
   * Estimate from raw text
   */
  estimateFromText(model: string, text: string, maxTokens?: number): TokenEstimate {
    const config = this.modelConfigs.get(model);

    if (!config) {
      throw new Error(`Unknown model: ${model}`);
    }

    // Simple estimation
    const inputTokens = Math.ceil(text.length / 4);
    const outputTokens = maxTokens ? Math.min(maxTokens, config.avgOutputTokens) : config.avgOutputTokens;

    const inputCost = (inputTokens / 1000) * config.inputCostPer1k;
    const outputCost = (outputTokens / 1000) * config.outputCostPer1k;
    const totalCost = inputCost + outputCost;

    return {
      model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCost: parseFloat(totalCost.toFixed(6)),
    };
  }

  /**
   * Get model pricing
   */
  getPricing(model: string): ModelTokenConfig | null {
    return this.modelConfigs.get(model) || null;
  }

  /**
   * List supported models
   */
  getSupportedModels(): string[] {
    return Array.from(this.modelConfigs.keys());
  }

  /**
   * Update model config
   */
  updateConfig(model: string, config: Partial<ModelTokenConfig>): void {
    const existing = this.modelConfigs.get(model);
    if (existing) {
      this.modelConfigs.set(model, { ...existing, ...config });
    }
  }

  /**
   * Estimate batch requests
   */
  estimateBatch(model: string, requestsCount: number, avgMessagesPerRequest: number = 1): {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalRequests: number;
    estimatedTotalCost: number;
    costPerRequest: number;
  } {
    const config = this.modelConfigs.get(model);

    if (!config) {
      throw new Error(`Unknown model: ${model}`);
    }

    const avgInputPerRequest = config.avgInputTokens * avgMessagesPerRequest;
    const totalInputTokens = avgInputPerRequest * requestsCount;
    const totalOutputTokens = config.avgOutputTokens * requestsCount;

    const inputCost = (totalInputTokens / 1000) * config.inputCostPer1k;
    const outputCost = (totalOutputTokens / 1000) * config.outputCostPer1k;
    const totalCost = inputCost + outputCost;

    return {
      totalInputTokens,
      totalOutputTokens,
      totalRequests: requestsCount,
      estimatedTotalCost: parseFloat(totalCost.toFixed(6)),
      costPerRequest: parseFloat((totalCost / requestsCount).toFixed(6)),
    };
  }
}

export const tokenEstimator = new TokenEstimator();
