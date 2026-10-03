// Native tool-calling streaming for OpenAI-format providers (CodeCraft / OpenAI-compatible, OpenAI, OpenRouter).
// Additive: the normal chat path (streamChat) is untouched.
import { open, sseData, parse, ChatStreamError } from "./chat-stream.server";
import { DEFAULT_BASE_URLS, validateBaseUrl, type ProviderType } from "./connections.server";

export type WireMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: WireToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export interface WireToolCall { id: string; type: "function"; function: { name: string; arguments: string } }
export interface WireTool { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }

export const TOOL_PROVIDERS: ProviderType[] = ["openai", "openai_compatible", "openrouter"];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export interface ToolTurn { text: string; toolCalls: WireToolCall[]; finishReason: string }

function baseFor(provider: ProviderType, baseUrl: string | null): string {
  if (!TOOL_PROVIDERS.includes(provider)) throw new ChatStreamError("model_unavailable");
  if (baseUrl) {
    try { return validateBaseUrl(baseUrl).replace(/\/+$/, ""); } catch { throw new ChatStreamError("provider_unavailable"); }
  }
  if (provider === "openai_compatible") throw new ChatStreamError("model_unavailable");
  return DEFAULT_BASE_URLS[provider as Exclude<ProviderType, "openai_compatible">];
}

export async function streamToolTurn(p: {
  provider: ProviderType; baseUrl: string | null; apiKey: string; model: string;
  messages: WireMessage[]; tools: WireTool[]; temperature: number | null; signal: AbortSignal;
}, onDelta: (t: string) => void): Promise<ToolTurn> {
  const base = baseFor(p.provider, p.baseUrl);
  const timeout = new AbortController();
  const body: Obj = { model: p.model, stream: true, messages: p.messages, tools: p.tools, tool_choice: "auto" };
  if (p.temperature != null && !(p.provider === "openai" && /^(o\d|gpt-5)/i.test(p.model))) body["temperature"] = p.temperature;
  const res = await open(`${base}/chat/completions`, { authorization: `Bearer ${p.apiKey}` }, body, p.signal, timeout);
  let text = "";
  let finishReason = "stop";
  const calls = new Map<number, { id: string; name: string; args: string }>();
  for await (const data of sseData(res, p.signal, timeout)) {
    if (data === "[DONE]") break;
    const ev = parse(data);
    if (!ev) continue;
    if (isObj(ev["error"])) throw new ChatStreamError("stream_failed");
    const choice = Array.isArray(ev["choices"]) ? ev["choices"][0] : undefined;
    if (!isObj(choice)) continue;
    const delta = choice["delta"];
    if (isObj(delta)) {
      if (typeof delta["content"] === "string" && delta["content"]) { text += delta["content"]; onDelta(delta["content"]); }
      if (Array.isArray(delta["tool_calls"])) {
        for (const tc of delta["tool_calls"]) {
          if (!isObj(tc)) continue;
          const idx = typeof tc["index"] === "number" ? tc["index"] : calls.size;
          const cur = calls.get(idx) ?? { id: "", name: "", args: "" };
          if (typeof tc["id"] === "string" && tc["id"]) cur.id = tc["id"];
          const fn = tc["function"];
          if (isObj(fn)) {
            if (typeof fn["name"] === "string") cur.name += fn["name"];
            if (typeof fn["arguments"] === "string") cur.args += fn["arguments"];
          }
          calls.set(idx, cur);
        }
      }
    }
    if (typeof choice["finish_reason"] === "string") finishReason = choice["finish_reason"];
  }
  const toolCalls = [...calls.entries()].sort((a, b) => a[0] - b[0]).filter(([, c]) => c.name)
    .map(([i, c]) => ({ id: c.id || `call_${i}_${Date.now()}`, type: "function" as const, function: { name: c.name, arguments: c.args || "{}" } }));
  return { text, toolCalls, finishReason };
}

/** Real capability probe: asks the model to call a trivial tool and checks for a structured tool_call. */
export async function probeToolCalling(p: { provider: ProviderType; baseUrl: string | null; apiKey: string; model: string }): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const turn = await streamToolTurn({
      ...p, temperature: null, signal: ctrl.signal,
      messages: [{ role: "user", content: "Call the get_time tool with timezone UTC. Do not answer in text." }],
      tools: [{ type: "function", function: { name: "get_time", description: "Returns the current time.", parameters: { type: "object", properties: { timezone: { type: "string" } }, required: ["timezone"], additionalProperties: false } } }],
    }, () => undefined);
    return turn.toolCalls.some((c) => c.function.name === "get_time");
  } catch {
    return false;
  } finally { clearTimeout(timer); }
}
