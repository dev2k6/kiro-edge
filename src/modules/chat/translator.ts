export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | any[];
  name?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  tools?: any[];
}

export interface KiroHistoryMessage {
  userMessage?: {
    content: string;
  };
  assistantResponseMessage?: {
    content: string;
  };
}

export interface KiroImage {
  format: string;
  source: {
    bytes: string;
  };
}

export interface KiroPayload {
  conversationState: {
    currentMessage: {
      userMessage: {
        content: string;
        images?: KiroImage[];
        userInputMessageContext?: any;
      };
    };
    history?: KiroHistoryMessage[];
  };
  profileArn?: string;
}

/**
 * Maps incoming OpenAI model names to Kiro/Claude target models.
 */
export function mapModel(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('gpt-4o') || m.includes('claude-3-5-sonnet') || m.includes('sonnet')) {
    return 'claude-3-5-sonnet-20241022';
  }
  if (m.includes('haiku')) {
    return 'claude-3-5-haiku-20241022';
  }
  if (m.includes('opus')) {
    return 'claude-3-opus-20240229';
  }
  return 'claude-3-5-sonnet-20241022';
}

/**
 * Translates an OpenAI Request format into Kiro's API Payload structure.
 */
export function translateOpenAIToKiro(req: OpenAIRequest): KiroPayload {
  let systemPrompt = '';
  const history: KiroHistoryMessage[] = [];
  let currentPrompt = '';
  let lastUserMessage = '';

  let images: KiroImage[] = [];

  for (const msg of req.messages) {
    let textContent = '';
    if (typeof msg.content === 'string') {
      textContent = msg.content;
    } else if (Array.isArray(msg.content)) {
      textContent = msg.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');
      
      // Extract images if any (only from the last user message for now, or accumulate them)
      if (msg.role === 'user') {
        const msgImages = msg.content.filter(c => c.type === 'image_url' || c.type === 'image_url');
        for (const img of msgImages) {
          const url = img.image_url?.url || '';
          if (url.startsWith('data:image/')) {
            const format = url.substring(11, url.indexOf(';'));
            const base64 = url.substring(url.indexOf('base64,') + 7);
            images.push({ format, source: { bytes: base64 } });
          }
        }
      }
    }

    if (msg.role === 'system') {
      systemPrompt += (systemPrompt ? '\n' : '') + textContent;
    } else if (msg.role === 'user') {
      lastUserMessage = lastUserMessage ? lastUserMessage + '\n' + textContent : textContent;
    } else if (msg.role === 'assistant') {
      if (lastUserMessage) {
        history.push({
          userMessage: { content: lastUserMessage },
          assistantResponseMessage: { content: textContent }
        });
        lastUserMessage = '';
      } else {
        history.push({
          assistantResponseMessage: { content: textContent }
        });
      }
    }
  }

  currentPrompt = lastUserMessage;

  // Prepend system prompt to the user prompt if system prompt exists
  if (systemPrompt) {
    currentPrompt = `System: ${systemPrompt}\n\nUser: ${currentPrompt}`;
  }

  let userInputMessageContext: any = undefined;
  if (req.tools && req.tools.length > 0) {
    userInputMessageContext = {
      tools: req.tools.map(t => ({
        toolSpecification: {
          name: t.function?.name || 'tool',
          description: t.function?.description || '',
          inputSchema: { json: t.function?.parameters || {} }
        }
      }))
    };
  }

  return {
    conversationState: {
      currentMessage: {
        userMessage: {
          content: currentPrompt || 'Hello',
          images: images.length > 0 ? images : undefined,
          userInputMessageContext
        }
      },
      history: history.length > 0 ? history : undefined
    }
  };
}

/**
 * Translates an Anthropic Claude Request into Kiro's API Payload structure.
 */
export function translateClaudeToKiro(claudeReq: any): KiroPayload {
  const messages = claudeReq.messages || [];
  let currentPrompt = '';
  const history: KiroHistoryMessage[] = [];
  let lastUserMessage = '';
  let systemPrefix = '';

  if (claudeReq.system) {
    const sysText = typeof claudeReq.system === 'string' 
      ? claudeReq.system 
      : Array.isArray(claudeReq.system) 
        ? claudeReq.system.map((s: any) => s.text).join('\n') 
        : '';
    if (sysText) {
      systemPrefix = `System: ${sysText}\n\n`;
    }
  }

  let images: KiroImage[] = [];

  for (const msg of messages) {
    let text = '';
    if (typeof msg.content === 'string') {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      text = msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
      
      if (msg.role === 'user') {
        const msgImages = msg.content.filter((c: any) => c.type === 'image');
        for (const img of msgImages) {
          if (img.source && img.source.type === 'base64') {
            const format = img.source.media_type ? img.source.media_type.split('/')[1] : 'jpeg';
            images.push({ format, source: { bytes: img.source.data } });
          }
        }
      }
    }

    if (msg.role === 'user') {
      lastUserMessage = lastUserMessage ? lastUserMessage + '\n' + text : text;
    } else if (msg.role === 'assistant') {
      if (lastUserMessage) {
        history.push({
          userMessage: { content: lastUserMessage },
          assistantResponseMessage: { content: text }
        });
        lastUserMessage = '';
      } else {
        history.push({
          assistantResponseMessage: { content: text }
        });
      }
    }
  }

  currentPrompt = systemPrefix + lastUserMessage;

  let userInputMessageContext: any = undefined;
  if (claudeReq.tools && claudeReq.tools.length > 0) {
    userInputMessageContext = {
      tools: claudeReq.tools.map((t: any) => ({
        toolSpecification: {
          name: t.name || 'tool',
          description: t.description || '',
          inputSchema: { json: t.input_schema || {} }
        }
      }))
    };
  }

  return {
    conversationState: {
      currentMessage: {
        userMessage: {
          content: currentPrompt || 'Hello',
          images: images.length > 0 ? images : undefined,
          userInputMessageContext
        }
      },
      history: history.length > 0 ? history : undefined
    }
  };
}

/**
 * Translates Kiro upstream JSON response into OpenAI Chat Completion response format.
 */
export function translateKiroToOpenAIResponse(kiroData: any, model: string): any {
  const content = kiroData?.assistantResponseMessage?.content || kiroData?.content || '';
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model || 'gpt-4o',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: content
        },
        finish_reason: 'stop'
      }
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };
}

/**
 * Translates Kiro upstream JSON response into Anthropic Claude Messages response format.
 */
export function translateKiroToClaudeResponse(kiroData: any, model: string): any {
  const content = kiroData?.assistantResponseMessage?.content || kiroData?.content || '';
  return {
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    model: model || 'claude-3-5-sonnet-20241022',
    content: [
      {
        type: 'text',
        text: content
      }
    ],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0
    }
  };
}
