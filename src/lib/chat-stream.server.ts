// Server-only streaming adapters for each provider. Emits normalized events; never
// surfaces raw provider bodies/headers.
import { DEFAULT_BASE_URLS, validateBaseUrl, type ProviderType } from "./connections.server";

export type ChatErrorCode = "model_unavailable" | "unauthorized_key" | "provider_unavailable" | "timeout" | "stream_failed" | "rate_limited";

export const FRIENDLY_ERRORS: Record<ChatErrorCode, string> = {
  model_unavailable: "This model is no longer available. Choose another model.",
  unauthorized_key: "The provider rejected this API key. Update the connection and try again.",
  provider_unavailable: "The provider is temporarily unavailable. Try again shortly.",
  timeout: "The response took too long. Please retry.",
  stream_failed: "Unable to stream this response. Your message was saved; try regenerating.",
  rate_limited: "The provider is rate limiting requests. Try again shortly.",
};

export class ChatStreamError extends Error {
  constructor(public code: ChatErrorCode) { super(code); }
}

export interface HistoryMessage { role: "user" | "assistant"; content: string }

export interface StreamParams {
  provider: ProviderType;
  baseUrl: string | null;
  apiKey: string;
  model: string;
  system: string | null;
  messages: HistoryMessage[];
  temperature: number | null;
  topP: number | null;
  maxTokens: number | null;
  signal: AbortSignal; // client stop
}

export interface StreamResult { finishReason: string; inputTokens?: number | undefined; outputTokens?: number | undefined }

/** Time allowed to receive response headers, and max silence between chunks. */
const CONNECT_TIMEOUT_MS = 60_000;
const IDLE_TIMEOUT_MS = 120_000;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function mapStatus(status: number): ChatErrorCode {
  if (status === 401 || status === 403) return "unauthorized_key";
  if (status === 404) return "model_unavailable";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "stream_failed";
}

async function open(url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal, timeout: AbortController): Promise<Response> {
  const combined = AbortSignal.any([signal, timeout.signal]);
  const timer = setTimeout(() => timeout.abort(), CONNECT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream", ...headers },
      body: JSON.stringify(body),
      signal: combined,
      redirect: "manual",
    });
    if (!res.ok || !res.body) {
      // Inspect (never forward) the body only to classify Gemini's 400 invalid-key response.
      const text = res.status === 400 ? await res.text().catch(() => "") : (await res.body?.cancel().catch(() => undefined), "");
      if (/API_KEY_INVALID|API key not valid/i.test(text)) throw new ChatStreamError("unauthorized_key");
      if (res.status === 400 && /not found|unsupported model|model_not_found|does not exist/i.test(text)) throw new ChatStreamError("model_unavailable");
      throw new ChatStreamError(mapStatus(res.status));
    }
    return res;
  } catch (e) {
    if (e instanceof ChatStreamError) throw e;
    if (signal.aborted) throw e; // user stop — propagate AbortError
    if (timeout.signal.aborted) throw new ChatStreamError("timeout");
    throw new ChatStreamError("provider_unavailable");
  } finally {
    clearTimeout(timer);
  }
}

/** Iterates SSE `data:` payloads, enforcing an idle timeout between chunks. */
async function* sseData(res: Response, signal: AbortSignal, timeout: AbortController): AsyncGenerator<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => timeout.abort(), IDLE_TIMEOUT_MS); };
  try {
    arm();
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (e) {
        if (signal.aborted) throw e;
        throw new ChatStreamError(timeout.signal.aborted ? "timeout" : "stream_failed");
      }
      if (chunk.done) break;
      arm();
      buf += decoder.decode(chunk.value, { stream: true });
      let idx: number;
      while ((idx = buf.search(/\r?\n/)) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + (buf[idx] === "\r" ? 2 : 1));
        if (line.startsWith("data:")) yield line.slice(5).trimStart();
      }
    }
    if (buf.startsWith("data:")) yield buf.slice(5).trimStart();
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

function parse(data: string): Obj | null {
  try { const v: unknown = JSON.parse(data); return isObj(v) ? v : null; } catch { return null; }
}

export async function streamChat(p: StreamParams, onDelta: (text: string) => void): Promise<StreamResult> {
  const timeout = new AbortController();
  let base: string;
  if (p.provider === "openai_compatible") {
    if (!p.baseUrl) throw new ChatStreamError("model_unavailable");
    try { base = validateBaseUrl(p.baseUrl); } catch { throw new ChatStreamError("provider_unavailable"); }
  } else {
    base = DEFAULT_BASE_URLS[p.provider];
  }

  if (p.provider === "anthropic") {
    const body: Obj = {
      model: p.model, stream: true, max_tokens: p.maxTokens ?? 4096,
      messages: p.messages,
      ...(p.system ? { system: p.system } : {}),
      ...(p.temperature != null ? { temperature: Math.min(p.temperature, 1) } : {}),
    };
    const res = await open(`${base}/v1/messages`, { "x-api-key": p.apiKey, "anthropic-version": "2023-06-01" }, body, p.signal, timeout);
    const out: StreamResult = { finishReason: "stop" };
    for await (const data of sseData(res, p.signal, timeout)) {
      const ev = parse(data);
      if (!ev) continue;
      const type = ev["type"];
      if (type === "content_block_delta" && isObj(ev["delta"]) && typeof ev["delta"]["text"] === "string") onDelta(ev["delta"]["text"]);
      else if (type === "message_start" && isObj(ev["message"]) && isObj(ev["message"]["usage"])) out.inputTokens = num(ev["message"]["usage"]["input_tokens"]);
      else if (type === "message_delta") {
        if (isObj(ev["usage"])) out.outputTokens = num(ev["usage"]["output_tokens"]);
        if (isObj(ev["delta"]) && typeof ev["delta"]["stop_reason"] === "string") out.finishReason = ev["delta"]["stop_reason"];
      } else if (type === "error") throw new ChatStreamError("stream_failed");
    }
    return out;
  }

  if (p.provider === "gemini") {
    const gen: Obj = {};
    if (p.temperature != null) gen["temperature"] = p.temperature;
    if (p.topP != null) gen["topP"] = p.topP;
    if (p.maxTokens != null) gen["maxOutputTokens"] = p.maxTokens;
    const body: Obj = {
      contents: p.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: gen,
      ...(p.system ? { systemInstruction: { parts: [{ text: p.system }] } } : {}),
    };
    const url = `${base}/v1beta/models/${encodeURIComponent(p.model)}:streamGenerateContent?alt=sse`;
    const res = await open(url, { "x-goog-api-key": p.apiKey }, body, p.signal, timeout);
    const out: StreamResult = { finishReason: "stop" };
    for await (const data of sseData(res, p.signal, timeout)) {
      const ev = parse(data);
      if (!ev) continue;
      const cand = Array.isArray(ev["candidates"]) ? ev["candidates"][0] : undefined;
      if (isObj(cand)) {
        const content = cand["content"];
        if (isObj(content) && Array.isArray(content["parts"])) {
          for (const part of content["parts"]) if (isObj(part) && typeof part["text"] === "string" && part["thought"] !== true) onDelta(part["text"]);
        }
        if (typeof cand["finishReason"] === "string") out.finishReason = cand["finishReason"].toLowerCase();
      }
      if (isObj(ev["usageMetadata"])) {
        out.inputTokens = num(ev["usageMetadata"]["promptTokenCount"]);
        out.outputTokens = num(ev["usageMetadata"]["candidatesTokenCount"]);
      }
    }
    return out;
  }

  // OpenAI, OpenRouter, OpenAI-compatible — Chat Completions streaming.
  const reasoningModel = p.provider === "openai" && /^(o\d|gpt-5)/i.test(p.model);
  const body: Obj = {
    model: p.model, stream: true, stream_options: { include_usage: true },
    messages: [...(p.system ? [{ role: "system", content: p.system }] : []), ...p.messages],
  };
  if (!reasoningModel) {
    if (p.temperature != null) body["temperature"] = p.temperature;
    if (p.topP != null) body["top_p"] = p.topP;
  }
  if (p.maxTokens != null) body[p.provider === "openai" ? "max_completion_tokens" : "max_tokens"] = p.maxTokens;
  const res = await open(`${base}/chat/completions`, { authorization: `Bearer ${p.apiKey}` }, body, p.signal, timeout);
  const out: StreamResult = { finishReason: "stop" };
  for await (const data of sseData(res, p.signal, timeout)) {
    if (data === "[DONE]") break;
    const ev = parse(data);
    if (!ev) continue;
    if (isObj(ev["error"])) throw new ChatStreamError("stream_failed");
    const choice = Array.isArray(ev["choices"]) ? ev["choices"][0] : undefined;
    if (isObj(choice)) {
      const delta = choice["delta"];
      if (isObj(delta) && typeof delta["content"] === "string" && delta["content"]) onDelta(delta["content"]);
      if (typeof choice["finish_reason"] === "string") out.finishReason = choice["finish_reason"];
    }
    if (isObj(ev["usage"])) {
      out.inputTokens = num(ev["usage"]["prompt_tokens"]);
      out.outputTokens = num(ev["usage"]["completion_tokens"]);
    }
  }
  return out;
}
