import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({ connectionId: z.string().uuid() });

interface AuthCtx {
  supabase: {
    rpc: (fn: "is_active_approved_user" | "can_manage_connection", args?: { _connection_id: string }) => PromiseLike<{ data: boolean | null; error: unknown }>;
  };
}

/** Verifies the caller is active+approved and may manage the connection, then loads it (with the encrypted key) server-side. */
async function loadManagedConnection(ctx: AuthCtx, connectionId: string) {
  const { data: active } = await ctx.supabase.rpc("is_active_approved_user");
  if (active !== true) throw new Error("Your account isn't approved or is disabled.");
  const { data: can } = await ctx.supabase.rpc("can_manage_connection", { _connection_id: connectionId });
  if (can !== true) throw new Error("You don't have permission to manage this connection.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("connections")
    .select("id, provider_type, base_url, encrypted_api_key").eq("id", connectionId).single();
  if (error || !data) throw new Error("Connection not found.");
  return { supabaseAdmin, conn: data };
}

export const testConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, conn } = await loadManagedConnection(context, data.connectionId);
    const { decryptApiKey } = await import("./connections.server");
    const { testProvider, ProviderError } = await import("./providers.server");
    type ProviderType = Parameters<typeof testProvider>[0];

    let status: string;
    try {
      const key = await decryptApiKey(conn.encrypted_api_key);
      status = await testProvider(conn.provider_type as ProviderType, conn.base_url, key);
    } catch (e) {
      status = e instanceof ProviderError ? e.status : "Provider unavailable";
      if (!(e instanceof ProviderError)) console.error("test-connection internal failure");
    }
    const ok = status === "Connected";
    const message = ok ? "Connection verified." : status;
    const now = new Date().toISOString();
    await supabaseAdmin.from("connections").update({
      last_tested_at: now, last_test_status: ok ? "success" : "error", last_test_message: message,
    }).eq("id", conn.id);
    return { ok, status, testedAt: now };
  });

export const fetchConnectionModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, conn } = await loadManagedConnection(context, data.connectionId);
    const { decryptApiKey } = await import("./connections.server");
    const { fetchModels, ProviderError } = await import("./providers.server");
    type ProviderType = Parameters<typeof fetchModels>[0];

    let models;
    try {
      const key = await decryptApiKey(conn.encrypted_api_key);
      models = await fetchModels(conn.provider_type as ProviderType, conn.base_url, key);
    } catch (e) {
      if (e instanceof ProviderError) throw new Error(`Couldn't fetch models: ${e.status}.`);
      console.error("list-models internal failure");
      throw new Error("Couldn't fetch models. Please try again.");
    }

    // De-duplicate; omit `enabled` so existing rows keep their setting and new rows default to enabled.
    const now = new Date().toISOString();
    const unique = new Map(models.map((m) => [m.provider_model_id, m]));
    const rows = [...unique.values()].map((m) => ({
      connection_id: conn.id,
      provider_model_id: m.provider_model_id.slice(0, 300),
      display_name: m.display_name.slice(0, 300),
      capabilities: m.capabilities,
      context_window: m.context_window,
      fetched_at: now,
      updated_at: now,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabaseAdmin.from("models").upsert(rows.slice(i, i + 500), { onConflict: "connection_id,provider_model_id" });
      if (error) { console.error("models upsert failed", error.code); throw new Error("Couldn't save models. Please try again."); }
    }
    return { count: rows.length };
  });
