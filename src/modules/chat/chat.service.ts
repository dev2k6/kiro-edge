import type { Context } from 'hono';
import type { AccountPool } from '../account/pool.service';
import type { Account } from '../../core/types';
import { 
  translateOpenAIToKiro, 
  translateClaudeToKiro, 
  translateKiroToOpenAIResponse, 
  translateKiroToClaudeResponse,
  mapModel
} from './translator';

function buildKiroHeaders(account: Account, isStream: boolean): Headers {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', isStream ? 'text/event-stream' : 'application/json');

  const sdkVersion = isStream ? "1.0.34" : "1.0.0";
  const apiName = isStream ? "codewhispererstreaming" : "codewhispererruntime";
  const userAgent = `aws-sdk-js/${sdkVersion} ua/2.1 os/linux lang/js md/nodejs#18.0.0 api/${apiName}#${sdkVersion} m/E KiroIDE-0.1.0`;
  const amzUserAgent = `aws-sdk-js/${sdkVersion} KiroIDE-0.1.0`;

  headers.set('User-Agent', userAgent);
  headers.set('x-amz-user-agent', amzUserAgent);
  headers.set('x-amzn-codewhisperer-optout', 'true');

  if (account.authMethod === 'api_key' && account.kiroApiKey) {
    headers.set('Authorization', `Bearer ${account.kiroApiKey}`);
    headers.set('tokentype', 'API_KEY');
  } else if (account.accessToken) {
    headers.set('Authorization', `Bearer ${account.accessToken}`);
  }

  if (account.authMethod === 'external_idp') {
    headers.set('TokenType', 'EXTERNAL_IDP');
  }

  return headers;
}
function parseEventStream(buffer: Uint8Array): { messages: string[], remaining: Uint8Array } {
  let offset = 0;
  const messages: string[] = [];
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  while (offset + 12 <= buffer.length) {
    const totalLength = view.getUint32(offset, false);
    if (totalLength > buffer.length - offset) {
      break; // incomplete chunk
    }
    const headersLength = view.getUint32(offset + 4, false);
    const payloadLength = totalLength - headersLength - 16;
    const payloadOffset = offset + 12 + headersLength;
    
    if (payloadLength > 0) {
      const payloadBytes = buffer.subarray(payloadOffset, payloadOffset + payloadLength);
      const payloadText = new TextDecoder().decode(payloadBytes);
      messages.push(payloadText);
    }
    offset += totalLength;
  }
  
  return { messages, remaining: buffer.slice(offset) };
}

export async function handleProxyRequest(c: Context, pool: AccountPool, type: 'openai' | 'claude') {
  let reqBody;
  try {
    reqBody = await c.req.json();
  } catch (e) {
    return c.json({ error: { message: "Invalid JSON request body" } }, 400);
  }

  const rawModel = reqBody.model || '';
  const targetModel = mapModel(rawModel);
  const isStream = reqBody.stream === true;

  const kiroPayload = type === 'openai' 
    ? translateOpenAIToKiro(reqBody) 
    : translateClaudeToKiro(reqBody);

  let lastError = "Unknown error";
  let lastStatus = 500;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const account = await pool.getNext(targetModel);
    if (!account) {
      return c.json({ error: { message: "No available Kiro accounts in pool" } }, 503);
    }

    if (account.profileArn) {
      kiroPayload.profileArn = account.profileArn;
    }

    const region = account.region || 'us-east-1';
    const upstreamBase = account.baseUrl 
      ? account.baseUrl 
      : (region === 'us-east-1' 
          ? 'https://codewhisperer.us-east-1.amazonaws.com' 
          : `https://q.${region}.amazonaws.com`);

    const upstreamUrl = `${upstreamBase}/generateAssistantResponse`;
    const headers = buildKiroHeaders(account, isStream);

    try {
      const response = await fetch(upstreamUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(kiroPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        lastError = errorText;
        lastStatus = response.status;
        
        if (response.status === 401 || response.status === 403 || errorText.includes("suspended")) {
          await pool.disableAccount(account.id, "Authentication failed, expired token, or account suspended");
        } else if (response.status === 429) {
          // Rate limited, try next account
        } else if (response.status >= 500) {
          // Upstream server error, try next account
        } else {
          // Client error (400, etc), don't retry
          return c.json({ 
            error: { 
              message: `Upstream Kiro API returned HTTP ${response.status}: ${errorText}`,
              type: "upstream_error",
              code: response.status 
            } 
          }, response.status as any);
        }
        continue; // Retry loop
      }

    if (isStream) {
      // 4a. Handle SSE Streaming response
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      if (response.body) {
        const reader = response.body.getReader();
        let buffer = new Uint8Array(0);

        (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              // Append new bytes to buffer
              const newBuffer = new Uint8Array(buffer.length + value.length);
              newBuffer.set(buffer);
              newBuffer.set(value, buffer.length);
              buffer = newBuffer;

              // Parse AWS EventStream
              const { messages, remaining } = parseEventStream(buffer);
              buffer = new Uint8Array(remaining);

              for (const msgText of messages) {
                if (!msgText.trim()) continue;
                
                try {
                  const payload = JSON.parse(msgText);
                  
                  if (payload.toolUseEvent) {
                    const tool = payload.toolUseEvent;
                    const inputStr = typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input || {});
                    if (type === 'openai') {
                      const sseChunk = `data: ${JSON.stringify({
                        id: `chatcmpl-${Date.now()}`,
                        object: 'chat.completion.chunk',
                        created: Math.floor(Date.now() / 1000),
                        model: rawModel,
                        choices: [{
                          index: 0,
                          delta: {
                            tool_calls: [{
                              index: 0,
                              id: tool.toolUseId || `call_${Date.now()}`,
                              type: "function",
                              function: {
                                name: tool.name || '',
                                arguments: inputStr
                              }
                            }]
                          },
                          finish_reason: null
                        }]
                      })}\n\n`;
                      await writer.write(encoder.encode(sseChunk));
                    }
                    continue;
                  }

                  const content = payload.assistantResponseEvent?.content || payload.content || '';
                  if (!content) continue;

                  if (type === 'openai') {
                    const sseChunk = `data: ${JSON.stringify({
                      id: `chatcmpl-${Date.now()}`,
                      object: 'chat.completion.chunk',
                      created: Math.floor(Date.now() / 1000),
                      model: rawModel,
                      choices: [{
                        index: 0,
                        delta: { content },
                        finish_reason: null
                      }]
                    })}\n\n`;
                    await writer.write(encoder.encode(sseChunk));
                  } else {
                    // Claude streaming format not fully implemented in original code, just raw text?
                    // We will wrap it in minimal Claude SSE event if requested, or just send content
                    await writer.write(encoder.encode(content));
                  }
                } catch (e) {
                  console.error("Error parsing payload json:", e);
                }
              }
            }

            if (type === 'openai') {
              await writer.write(encoder.encode("data: [DONE]\n\n"));
            }
          } catch (err) {
            console.error("Error streaming upstream response:", err);
          } finally {
            await writer.close();
          }
        })();
      }

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } else {
      // 4b. Handle Non-streaming response
      const kiroData = await response.json();

      if (type === 'openai') {
        return c.json(translateKiroToOpenAIResponse(kiroData, rawModel));
      } else {
        return c.json(translateKiroToClaudeResponse(kiroData, targetModel));
      }
    }
  } catch (err: any) {
    lastError = err.message;
    lastStatus = 500;
    continue; // Retry loop on fetch failure
  }
  } // end retry loop
  
  return c.json({ 
    error: { 
      message: `All retries failed. Last error (HTTP ${lastStatus}): ${lastError}`,
      type: "upstream_error",
      code: lastStatus 
    } 
  }, (lastStatus === 0 ? 500 : lastStatus) as any);
}
