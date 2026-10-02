// Server-only helpers for provider connections: encryption and endpoint validation.
// Never import from client code.

export const PROVIDER_TYPES = ["openai", "anthropic", "gemini", "openrouter", "openai_compatible", "stability", "flux"] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const DEFAULT_BASE_URLS: Record<Exclude<ProviderType, "openai_compatible">, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  gemini: "https://generativelanguage.googleapis.com",
  openrouter: "https://openrouter.ai/api/v1",
  stability: "https://api.stability.ai",
  flux: "https://api.bfl.ai",
};

const PAYLOAD_VERSION = "v1";

function b64(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}
function unb64(s: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function getKey(): Promise<CryptoKey> {
  const secret = process.env["CONNECTION_ENCRYPTION_KEY"];
  if (!secret || secret.length < 32) throw new Error("Encryption is not configured.");
  // Derive a fixed 256-bit AES key from the secret.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Returns "v1:<iv b64>:<ciphertext b64>" (AES-256-GCM, 96-bit IV). */
export async function encryptApiKey(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await getKey(), new TextEncoder().encode(plain)));
  return `${PAYLOAD_VERSION}:${b64(iv)}:${b64(ct)}`;
}

/** Decrypt only immediately before calling a provider. Never log the result. */
export async function decryptApiKey(payload: string): Promise<string> {
  const [version, ivB64, ctB64] = payload.split(":");
  if (version !== PAYLOAD_VERSION || !ivB64 || !ctB64) throw new Error("Unsupported key payload.");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(ivB64) }, await getKey(), unb64(ctB64));
  return new TextDecoder().decode(pt);
}

export function keyHint(plain: string): string {
  return `…${plain.slice(-4)}`;
}

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local + metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!h.includes(":")) return false;
  if (h === "::" || h === "::1") return true;
  if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return true; // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique local
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPrivateIPv4(mapped[1]);
  return h.startsWith("::ffff:");
}

const BLOCKED_HOSTS = ["localhost", "metadata.google.internal", "metadata", "instance-data"];
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa", ".intranet", ".corp"];

/**
 * Validates a custom provider base URL against SSRF. Local/private endpoints are only
 * allowed when the server-side flag ALLOW_LOCAL_PROVIDER_ENDPOINTS === "true".
 * Returns the normalized URL or throws a friendly Error.
 */
export function validateBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Base URL is not a valid URL.");
  }
  if (url.username || url.password) throw new Error("Base URL must not contain credentials.");
  const allowLocal = process.env["ALLOW_LOCAL_PROVIDER_ENDPOINTS"] === "true" || process.env["ALLOW_LOCAL_PROVIDER_URLS"] === "true";
  const host = url.hostname.toLowerCase();

  if (!allowLocal) {
    if (url.protocol !== "https:") throw new Error("Base URL must use HTTPS.");
    const internal =
      BLOCKED_HOSTS.includes(host) ||
      BLOCKED_SUFFIXES.some((s) => host.endsWith(s)) ||
      !host.includes(".") ||
      isPrivateIPv4(host) ||
      isPrivateIPv6(host) ||
      /^\d+$/.test(host) || // decimal-encoded IPs
      /^0x/i.test(host);
    if (internal) throw new Error("Base URL points to a local or private network address, which isn't allowed.");
  } else if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Base URL must use HTTP or HTTPS.");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}
