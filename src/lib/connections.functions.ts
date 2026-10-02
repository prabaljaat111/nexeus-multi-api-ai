import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Google Gemini" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "openai_compatible", label: "OpenAI-compatible" },
  { value: "stability", label: "Stability AI (images)" },
  { value: "flux", label: "FLUX / Black Forest Labs (images)" },
] as const;
export type ProviderValue = (typeof PROVIDERS)[number]["value"];

/** Safe metadata columns only — encrypted_api_key is never selected or returned. */
export const SAFE_CONNECTION_COLUMNS =
  "id, owner_user_id, scope, name, provider_type, base_url, key_hint, enabled, last_tested_at, last_test_status, last_test_message, created_at, updated_at";

const upsertSchema = z
  .object({
    id: z.string().uuid().optional(),
    scope: z.enum(["personal", "global"]),
    name: z.string().trim().min(1, "Name is required").max(100),
    providerType: z.enum(["openai", "anthropic", "gemini", "openrouter", "openai_compatible", "stability", "flux"]),
    baseUrl: z.string().trim().max(500).optional(),
    apiKey: z.string().trim().min(8, "API key looks too short").max(4000).optional(),
    enabled: z.boolean(),
  })
  .refine((d) => d.id || d.apiKey, { message: "API key is required", path: ["apiKey"] })
  .refine((d) => d.providerType !== "openai_compatible" || !!d.baseUrl, { message: "Base URL is required", path: ["baseUrl"] });

type Ctx = { supabase: { rpc: (fn: "is_admin" | "is_active_approved_user") => PromiseLike<{ data: boolean | null; error: unknown }> }; userId: string };

async function authorize(ctx: Ctx, scope: "personal" | "global") {
  const { data: active } = await ctx.supabase.rpc("is_active_approved_user");
  if (active !== true) throw new Error("Your account isn't approved or is disabled.");
  if (scope === "global") {
    const { data: admin } = await ctx.supabase.rpc("is_admin");
    if (admin !== true) throw new Error("Only administrators can manage shared connections.");
  }
}

export const upsertConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    await authorize(context, data.scope);
    const { encryptApiKey, keyHint, validateBaseUrl } = await import("./connections.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Standard providers use server-side defaults; only openai_compatible stores a custom URL.
    const baseUrl = data.baseUrl ? validateBaseUrl(data.baseUrl) : null;
    const ownerId = data.scope === "personal" ? context.userId : null;

    const fields: {
      name: string; provider_type: string; base_url: string | null; enabled: boolean;
      encrypted_api_key?: string; key_hint?: string;
    } = { name: data.name, provider_type: data.providerType, base_url: baseUrl, enabled: data.enabled };
    if (data.apiKey) {
      fields.encrypted_api_key = await encryptApiKey(data.apiKey);
      fields.key_hint = keyHint(data.apiKey);
    }

    if (data.id) {
      let q = supabaseAdmin.from("connections").update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", data.id).eq("scope", data.scope);
      q = ownerId ? q.eq("owner_user_id", ownerId) : q.is("owner_user_id", null);
      const { data: rows, error } = await q.select("id");
      if (error) { console.error("connection update failed", error.code); throw new Error("Couldn't save the connection."); }
      if (!rows?.length) throw new Error("Connection not found.");
      return { id: data.id };
    }

    if (!fields.encrypted_api_key) throw new Error("API key is required.");
    const { data: row, error } = await supabaseAdmin.from("connections")
      .insert({ ...fields, encrypted_api_key: fields.encrypted_api_key, scope: data.scope, owner_user_id: ownerId })
      .select("id").single();
    if (error) { console.error("connection insert failed", error.code); throw new Error("Couldn't save the connection."); }
    return { id: row.id };
  });

export const deleteConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), scope: z.enum(["personal", "global"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await authorize(context, data.scope);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("connections").delete().eq("id", data.id).eq("scope", data.scope);
    q = data.scope === "personal" ? q.eq("owner_user_id", context.userId) : q.is("owner_user_id", null);
    const { data: rows, error } = await q.select("id");
    if (error) { console.error("connection delete failed", error.code); throw new Error("Couldn't delete the connection."); }
    if (!rows?.length) throw new Error("Connection not found.");
    return { ok: true as const };
  });
