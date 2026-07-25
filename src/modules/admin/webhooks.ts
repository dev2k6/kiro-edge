/**
 * Webhook Module
 * Event-based webhooks for request/response notifications
 */

export interface WebhookEvent {
  type: 'request' | 'response' | 'error' | 'cache_hit';
  timestamp: string;
  data: Record<string, any>;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  secret?: string;
  createdAt: string;
}

export class WebhookManager {
  private endpoints: Map<string, WebhookEndpoint> = new Map();
  private eventQueue: WebhookEvent[] = [];
  private maxQueueSize = 1000;

  /**
   * Register webhook
   */
  register(url: string, events: string[], secret?: string): string {
    const id = this.generateId();
    const endpoint: WebhookEndpoint = {
      id,
      url,
      events,
      active: true,
      secret,
      createdAt: new Date().toISOString(),
    };

    this.endpoints.set(id, endpoint);
    return id;
  }

  /**
   * Unregister webhook
   */
  unregister(id: string): boolean {
    return this.endpoints.delete(id);
  }

  /**
   * Get webhook
   */
  get(id: string): WebhookEndpoint | null {
    return this.endpoints.get(id) || null;
  }

  /**
   * List webhooks
   */
  list(): WebhookEndpoint[] {
    return Array.from(this.endpoints.values());
  }

  /**
   * Publish event
   */
  publish(event: WebhookEvent): void {
    // Add to queue
    this.eventQueue.push(event);

    if (this.eventQueue.length > this.maxQueueSize) {
      this.eventQueue = this.eventQueue.slice(-this.maxQueueSize);
    }

    // Trigger webhooks that subscribe to this event
    for (const endpoint of this.endpoints.values()) {
      if (endpoint.active && endpoint.events.includes(event.type)) {
        this.sendWebhook(endpoint, event);
      }
    }
  }

  /**
   * Send webhook (async)
   */
  private async sendWebhook(endpoint: WebhookEndpoint, event: WebhookEvent): Promise<void> {
    try {
      const payload = JSON.stringify(event);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Event': event.type,
        'X-Webhook-Timestamp': event.timestamp,
      };

      // Add signature if secret exists
      if (endpoint.secret) {
        const signature = this.generateSignature(payload, endpoint.secret);
        headers['X-Webhook-Signature'] = signature;
      }

      // Send request (non-blocking)
      fetch(endpoint.url, {
        method: 'POST',
        headers,
        body: payload,
      }).catch((err) => {
        console.error(`Webhook error for ${endpoint.id}:`, (err as Error).message);
      });
    } catch (err) {
      console.error(`Failed to send webhook to ${endpoint.url}:`, err);
    }
  }

  /**
   * Generate signature (base64 encoding)
   */
  private generateSignature(payload: string, secret: string): string {
    const combined = `${payload}:${secret}`;
    return btoa(combined);
  }

  /**
   * Get recent events
   */
  getEvents(limit: number = 100): WebhookEvent[] {
    return this.eventQueue.slice(-limit);
  }

  /**
   * Clear events
   */
  clearEvents(): void {
    this.eventQueue = [];
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update webhook
   */
  update(id: string, updates: Partial<WebhookEndpoint>): boolean {
    const endpoint = this.endpoints.get(id);
    if (!endpoint) return false;

    const updated = { ...endpoint, ...updates };
    this.endpoints.set(id, updated);
    return true;
  }

  /**
   * Test webhook
   */
  async test(id: string): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const endpoint = this.endpoints.get(id);
    if (!endpoint) {
      return { success: false, error: 'Webhook not found' };
    }

    const testEvent: WebhookEvent = {
      type: 'request',
      timestamp: new Date().toISOString(),
      data: { test: true, message: 'This is a test webhook' },
    };

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Test': 'true',
        },
        body: JSON.stringify(testEvent),
      });

      return { success: response.ok, statusCode: response.status };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}

export const webhookManager = new WebhookManager();
