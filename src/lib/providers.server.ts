// Server-only provider HTTP helpers. Never return raw upstream bodies or headers.
import { DEFAULT_BASE_URLS, validateBaseUrl, type ProviderType } from "./connections.server";
import { FLUX_MODELS, STABILITY_MODELS, openAiImageCaps } from "./image-catalog";

export type TestStatus = "Connected" | "Unauthorized key" | "Invalid endpoint" | "Provider timed out" | "Rate limited" | "Provider unavailable";

export class ProviderError extends Error {
  constructor(public status: Exclude<TestStatus, "Connected">) {
    super(status);
  }
}

export interface NormalizedModel {
  provider_model_id: string;
  display_name: string;
  capabilities: Record<string, unknown>;
  context_window: number | null;
}

const TIMEOUT_MS = 15_000;
const MAX_PAGES = 20;

export function resolveBase(provider: ProviderType, baseUrl: string | null): string {
  // Any provider may use a custom (validated, SSRF-checked) base URL, e.g. a proxy.
  if (baseUrl) {
    try { return validateBaseUrl(baseUrl).replace(/\/+$/, ""); } catch { throw new ProviderError("Invalid endpoint"); }
  }
  if (provider === "openai_compatible") throw new ProviderError("Invalid endpoint");
  return DEFAULT_BASE_URLS[provider];
}

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    // redirect: "manual" prevents redirect-based SSRF to internal hosts.
    res = await fetch(url, { headers: { accept: "application/json", ...headers }, signal: ctrl.signal, redirect: "manual" });
  } catch (e) {
    throw new ProviderError(e instanceof Error && e.name === "AbortError" ? "Provider timed out" : "Invalid endpoint");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) throw new ProviderError("Unauthorized key");
  if (res.status === 429) throw new ProviderError("Rate limited");
  if (res.status >= 500) throw new ProviderError("Provider unavailable");
  if (!res.ok) throw new ProviderError(res.status === 400 && url.includes("googleapis") ? "Unauthorized key" : "Invalid endpoint");
  try { return await res.json(); } catch { throw new ProviderError("Invalid endpoint"); }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
const posInt = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);

function dataArray(body: unknown, key = "data"): Obj[] {
  if (!isObj(body) || !Array.isArray(body[key])) throw new ProviderError("Invalid endpoint");
  return (body[key] as unknown[]).filter(isObj);
}

export async function fetchModels(provider: ProviderType, baseUrl: string | null, apiKey: string): Promise<NormalizedModel[]> {
  const base = resolveBase(provider, baseUrl);

  // Image-only providers have no model-list endpoint for these APIs: verify the key, then use the documented catalog.
  if (provider === "stability" || provider === "flux") {
    await testProvider(provider, baseUrl, apiKey);
    const list = provider === "stability" ? STABILITY_MODELS : FLUX_MODELS;
    return list.map((m) => ({ provider_model_id: m.id, display_name: m.name, capabilities: { ...m.caps }, context_window: null }));
  }

  if (provider === "anthropic") {
    const out: NormalizedModel[] = [];
    let after: string | null = null;
    for (let i = 0; i < MAX_PAGES; i++) {
      const qs: string = `limit=1000${after ? `&after_id=${encodeURIComponent(after)}` : ""}`;
      const body = await getJson(`${base}/v1/models?${qs}`, { "x-api-key": apiKey, "anthropic-version": "2023-06-01" });
      const items = dataArray(body);
      for (const m of items) {
        const id = str(m["id"]);
        if (id) out.push({ provider_model_id: id, display_name: str(m["display_name"]) ?? id, capabilities: anthropicVision(id) ? { chat: true, vision: true } : {}, context_window: null });
      }
      after = isObj(body) && body["has_more"] === true ? str(body["last_id"]) : null;
      if (!after) break;
    }
    return out;
  }

  if (provider === "gemini") {
    const out: NormalizedModel[] = [];
    let token: string | null = null;
    for (let i = 0; i < MAX_PAGES; i++) {
      const qs: string = `pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`;
      const body = await getJson(`${base}/v1beta/models?${qs}`, { "x-goog-api-key": apiKey });
      for (const m of dataArray(body, "models")) {
        const name = str(m["name"]);
        if (!name) continue;
        const id = name.replace(/^models\//, "");
        const methods = Array.isArray(m["supportedGenerationMethods"]) ? (m["supportedGenerationMethods"] as unknown[]) : [];
        const caps: Record<string, boolean> = {};
        if (methods.includes("generateContent")) caps["chat"] = true;
        if (methods.includes("embedContent")) caps["embeddings"] = true;
        if (caps["chat"] && /^gemini-(1\.5|2|3)/.test(id) && !/(tts|embedding|image-generation|aqa)/.test(id)) caps["vision"] = true;
        out.push({ provider_model_id: id, display_name: str(m["displayName"]) ?? id, capabilities: caps, context_window: posInt(m["inputTokenLimit"]) });
      }
      token = isObj(body) ? str(body["nextPageToken"]) : null;
      if (!token) break;
    }
    return out;
  }

  // OpenAI, OpenRouter, OpenAI-compatible: GET {base}/models
  const body = await getJson(`${base}/models`, { authorization: `Bearer ${apiKey}` });
  return dataArray(body).flatMap((m): NormalizedModel[] => {
    const id = str(m["id"]);
    if (!id) return [];
    const caps: Record<string, unknown> = {};
    if (provider === "openai") { const img = openAiImageCaps(id); if (img) Object.assign(caps, img); else if (openAiVision(id)) { caps["chat"] = true; caps["vision"] = true; } }
    let ctx: number | null = null;
    let name = id;
    if (provider === "openrouter") {
      name = str(m["name"]) ?? id;
      ctx = posInt(m["context_length"]);
      const arch = m["architecture"];
      if (isObj(arch) && Array.isArray(arch["input_modalities"])) {
        const mods = arch["input_modalities"] as unknown[];
        caps["chat"] = true;
        if (mods.includes("image")) caps["vision"] = true;
      }
    }
    return [{ provider_model_id: id, display_name: name, capabilities: caps, context_window: ctx }];
  });
}

/** Low-cost auth check using the provider's model-list endpoint. */
export async function testProvider(provider: ProviderType, baseUrl: string | null, apiKey: string): Promise<TestStatus> {
  const base = resolveBase(provider, baseUrl);
  if (provider === "anthropic") await getJson(`${base}/v1/models?limit=1`, { "x-api-key": apiKey, "anthropic-version": "2023-06-01" });
  else if (provider === "gemini") await getJson(`${base}/v1beta/models?pageSize=1`, { "x-goog-api-key": apiKey });
  // OpenRouter's model list is public, so check the key endpoint instead.
  else if (provider === "stability") await getJson(`${base}/v1/user/account`, { authorization: `Bearer ${apiKey}` });
  else if (provider === "flux") await getJson(`${base}/v1/credits`, { "x-key": apiKey });
  else if (provider === "openrouter") await getJson(`${base}/key`, { authorization: `Bearer ${apiKey}` });
  else dataArray(await getJson(`${base}/models`, { authorization: `Bearer ${apiKey}` }));
  return "Connected";
}

/** Explicit, documented vision-capable families only — unknown ids never get vision. */
function anthropicVision(id: string): boolean {
  return /^claude-(3|3-5|3-7|opus-4|sonnet-4|haiku-4|opus-5|sonnet-5|haiku-5)/.test(id) || /^claude-(opus|sonnet|haiku)-\d/.test(id);
}
function openAiVision(id: string): boolean {
  if (/(audio|realtime|search|transcribe|tts|embedding|moderation|instruct)/.test(id)) return false;
  return /^(gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-5|o1(?!-mini)|o3(?!-mini)|o4-mini|chatgpt-4o)/.test(id);
}
