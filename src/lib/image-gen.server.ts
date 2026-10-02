// Server-only image generation against documented provider APIs. Never return raw upstream bodies.
import { resolveBase } from "./providers.server";
import type { ProviderType } from "./connections.server";

export type ImageErrorCode = "provider_unavailable" | "invalid_model" | "rejected" | "timeout" | "unauthorized" | "rate_limited" | "cancelled";

export class ImageGenError extends Error {
  constructor(public code: ImageErrorCode) { super(code); }
}

export const IMAGE_ERRORS: Record<ImageErrorCode, string> = {
  provider_unavailable: "The image provider is unavailable right now. Try again later.",
  invalid_model: "This model can't generate images. Choose another image model.",
  rejected: "The provider rejected this request, possibly under its content policy. Try a different prompt.",
  timeout: "Image generation timed out. Please try again.",
  unauthorized: "The provider rejected the connection's API key. Check it in Settings → Connections.",
  rate_limited: "The provider is rate limiting requests. Wait a moment and try again.",
  cancelled: "Image generation was cancelled.",
};

export interface GenInput {
  provider: ProviderType;
  baseUrl: string | null;
  apiKey: string;
  model: string;
  prompt: string;
  negativePrompt?: string | null;
  size?: string | null;
  aspectRatio?: string | null;
  quality?: string | null;
  style?: string | null;
  isCancelled: () => Promise<boolean>;
  onProviderJob?: (id: string) => Promise<void>;
}

export interface GenResult { bytes: Uint8Array; mime: string; revisedPrompt: string | null }

const REQUEST_TIMEOUT_MS = 120_000;
const POLL_TIMEOUT_MS = 180_000;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

async function call(url: string, init: RequestInit, timeout = REQUEST_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: "manual" });
  } catch (e) {
    throw new ImageGenError(e instanceof Error && e.name === "AbortError" ? "timeout" : "provider_unavailable");
  } finally { clearTimeout(t); }
}

function mapStatus(res: Response): never {
  if (res.status === 401 || res.status === 403) throw new ImageGenError("unauthorized");
  if (res.status === 429) throw new ImageGenError("rate_limited");
  if (res.status === 400 || res.status === 422) throw new ImageGenError("rejected");
  if (res.status === 404) throw new ImageGenError("invalid_model");
  throw new ImageGenError("provider_unavailable");
}

function sniffMime(b: Uint8Array): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  return null;
}

function checkImage(bytes: Uint8Array): GenResult["mime"] {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new ImageGenError("provider_unavailable");
  const mime = sniffMime(bytes);
  if (!mime) throw new ImageGenError("provider_unavailable"); // only accept real raster images
  return mime;
}

function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function openai(i: GenInput): Promise<GenResult> {
  const base = resolveBase(i.provider, i.baseUrl);
  const isDalle = i.model.startsWith("dall-e");
  const body: Record<string, unknown> = { model: i.model, prompt: i.prompt, n: 1 };
  if (i.size) body["size"] = i.size;
  if (i.quality) body["quality"] = i.quality;
  if (i.style && i.model === "dall-e-3") body["style"] = i.style;
  if (isDalle) body["response_format"] = "b64_json"; // gpt-image models always return base64
  const res = await call(`${base}/images/generations`, {
    method: "POST", headers: { authorization: `Bearer ${i.apiKey}`, "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) mapStatus(res);
  const json = (await res.json().catch(() => null)) as { data?: { b64_json?: string; revised_prompt?: string }[] } | null;
  const first = json?.data?.[0];
  if (!first?.b64_json) throw new ImageGenError("provider_unavailable");
  const bytes = fromB64(first.b64_json);
  return { bytes, mime: checkImage(bytes), revisedPrompt: first.revised_prompt?.slice(0, 4000) ?? null };
}

async function stability(i: GenInput): Promise<GenResult> {
  const base = resolveBase(i.provider, i.baseUrl);
  const path = i.model === "stable-image-ultra" ? "ultra" : i.model === "stable-image-core" ? "core" : i.model.startsWith("sd3") ? "sd3" : null;
  if (!path) throw new ImageGenError("invalid_model");
  const form = new FormData();
  form.set("prompt", i.prompt);
  form.set("output_format", "png");
  if (path === "sd3") form.set("model", i.model);
  if (i.aspectRatio) form.set("aspect_ratio", i.aspectRatio);
  if (i.negativePrompt) form.set("negative_prompt", i.negativePrompt);
  if (i.style) form.set("style_preset", i.style);
  const res = await call(`${base}/v2beta/stable-image/generate/${path}`, {
    method: "POST", headers: { authorization: `Bearer ${i.apiKey}`, accept: "image/*" }, body: form,
  });
  if (!res.ok) mapStatus(res);
  if (res.headers.get("finish-reason") === "CONTENT_FILTERED") throw new ImageGenError("rejected");
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, mime: checkImage(bytes), revisedPrompt: null };
}

/** Provider-returned URLs must stay on BFL hosts (prevents SSRF through polling/result URLs). */
function bflUrl(raw: unknown): string {
  if (typeof raw !== "string") throw new ImageGenError("provider_unavailable");
  let u: URL;
  try { u = new URL(raw); } catch { throw new ImageGenError("provider_unavailable"); }
  if (u.protocol !== "https:" || !(u.hostname === "bfl.ai" || u.hostname.endsWith(".bfl.ai"))) throw new ImageGenError("provider_unavailable");
  return u.toString();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function flux(i: GenInput): Promise<GenResult> {
  const base = resolveBase(i.provider, i.baseUrl);
  if (!/^flux-[a-z0-9.\-]+$/.test(i.model)) throw new ImageGenError("invalid_model");
  const body: Record<string, unknown> = { prompt: i.prompt, output_format: "png" };
  if (i.aspectRatio) {
    if (i.model === "flux-pro-1.1") {
      // flux-pro-1.1 takes width/height (multiples of 32); derive from the ratio at ~1 MP.
      const [w, h] = i.aspectRatio.split(":").map(Number) as [number, number];
      const scale = Math.sqrt((1024 * 1024) / (w * h));
      body["width"] = Math.min(1440, Math.max(256, Math.round((w * scale) / 32) * 32));
      body["height"] = Math.min(1440, Math.max(256, Math.round((h * scale) / 32) * 32));
    } else body["aspect_ratio"] = i.aspectRatio;
  }
  const res = await call(`${base}/v1/${i.model}`, {
    method: "POST", headers: { "x-key": i.apiKey, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) mapStatus(res);
  const job = (await res.json().catch(() => null)) as { id?: string; polling_url?: string } | null;
  if (!job?.id) throw new ImageGenError("provider_unavailable");
  await i.onProviderJob?.(job.id);
  const pollUrl = job.polling_url ? bflUrl(job.polling_url) : `${base}/v1/get_result?id=${encodeURIComponent(job.id)}`;

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let delay = 1000;
  while (Date.now() < deadline) {
    await sleep(delay);
    delay = Math.min(delay * 1.5, 4000);
    if (await i.isCancelled()) throw new ImageGenError("cancelled");
    const r = await call(pollUrl, { headers: { "x-key": i.apiKey, accept: "application/json" } }, 20_000);
    if (r.status === 429) continue;
    if (!r.ok) mapStatus(r);
    const p = (await r.json().catch(() => null)) as { status?: string; result?: { sample?: string } } | null;
    const st = p?.status ?? "";
    if (st === "Ready") {
      const img = await call(bflUrl(p?.result?.sample), {}, 60_000);
      if (!img.ok) throw new ImageGenError("provider_unavailable");
      const bytes = new Uint8Array(await img.arrayBuffer());
      return { bytes, mime: checkImage(bytes), revisedPrompt: null };
    }
    if (st === "Request Moderated" || st === "Content Moderated") throw new ImageGenError("rejected");
    if (st === "Error" || st === "Task not found") throw new ImageGenError("provider_unavailable");
  }
  throw new ImageGenError("timeout");
}

export async function generateImage(i: GenInput): Promise<GenResult> {
  if (i.provider === "openai" || i.provider === "openai_compatible") return openai(i);
  if (i.provider === "stability") return stability(i);
  if (i.provider === "flux") return flux(i);
  throw new ImageGenError("invalid_model");
}
