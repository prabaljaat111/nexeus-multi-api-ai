import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TOOL_GROUPS, type PermissionMode, type ToolGroup } from "./agent-tools";

interface Ctx { supabase: { rpc: (fn: "is_active_approved_user") => PromiseLike<{ data: boolean | null }> }; userId: string }
async function requireActive(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("is_active_approved_user");
  if (data !== true) throw new Error("Your account isn't approved or is disabled.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export interface AgentState {
  runners: { id: string; name: string; status: string; online: boolean; version: string | null; platform: string | null; lastSeen: string | null }[];
  workspaces: { id: string; runnerId: string; name: string; root: string; isDefault: boolean }[];
  permissions: Record<ToolGroup, PermissionMode>;
  agentDefault: boolean; autoContinue: boolean;
  devServers: { id: string; workspaceId: string; command: string; status: string; port: number | null; startedAt: string | null }[];
}

export const getAgentState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AgentState> => {
    const sb = context.supabase;
    const { isOnline } = await import("./agent-relay.server");
    const [runners, workspaces, perms, profile, servers] = await Promise.all([
      sb.from("agent_runners").select("id, name, status, runner_version, platform, last_seen_at").eq("user_id", context.userId).neq("status", "revoked").order("created_at"),
      sb.from("agent_workspaces").select("id, runner_id, name, configured_root, is_default").eq("user_id", context.userId).order("created_at"),
      sb.from("agent_tool_permissions").select("tool_name, permission_mode").eq("user_id", context.userId).is("workspace_id", null),
      sb.from("profiles").select("agent_mode_default, agent_auto_continue").eq("id", context.userId).maybeSingle(),
      sb.from("managed_dev_servers").select("id, workspace_id, command_summary, status, local_port, started_at").eq("user_id", context.userId),
    ]);
    const permissions = Object.fromEntries(TOOL_GROUPS.map((g) => [g.id, g.default])) as Record<ToolGroup, PermissionMode>;
    for (const p of perms.data ?? []) if (p.tool_name in permissions) permissions[p.tool_name as ToolGroup] = p.permission_mode as PermissionMode;
    return {
      runners: (runners.data ?? []).map((r) => ({ id: r.id, name: r.name, status: r.status, online: r.status === "connected" && isOnline(r.last_seen_at), version: r.runner_version, platform: r.platform, lastSeen: r.last_seen_at })),
      workspaces: (workspaces.data ?? []).map((w) => ({ id: w.id, runnerId: w.runner_id, name: w.name, root: w.configured_root, isDefault: w.is_default })),
      permissions, agentDefault: profile.data?.agent_mode_default ?? false, autoContinue: profile.data?.agent_auto_continue ?? true,
      devServers: (servers.data ?? []).map((d) => ({ id: d.id, workspaceId: d.workspace_id, command: d.command_summary, status: d.status, port: d.local_port, startedAt: d.started_at })),
    };
  });

/** Creates a pending runner and a one-time pairing code (shown once; only its hash is stored). */
export const createRunnerPairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().trim().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireActive(context);
    const { count } = await admin.from("agent_runners").select("id", { count: "exact", head: true }).eq("user_id", context.userId).neq("status", "revoked");
    if ((count ?? 0) >= 5) throw new Error("You can pair up to 5 runners. Remove one first.");
    const { sha256Hex } = await import("./agent-relay.server");
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    const code = [...bytes].map((b) => alphabet[b % alphabet.length]).join("").replace(/(.{5})/, "$1-");
    const { data: runner, error } = await admin.from("agent_runners").insert({ user_id: context.userId, name: data.name, status: "pending" }).select("id").single();
    if (error || !runner) throw new Error("Couldn't create the runner.");
    const expires = new Date(Date.now() + 15 * 60_000).toISOString();
    await admin.from("agent_runner_credentials").insert({ runner_id: runner.id, pairing_code_hash: await sha256Hex(code), pairing_expires_at: expires });
    return { runnerId: runner.id, code, expiresAt: expires };
  });

export const revokeRunner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ runnerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireActive(context);
    const { data: r } = await admin.from("agent_runners").select("id").eq("id", data.runnerId).eq("user_id", context.userId).maybeSingle();
    if (!r) throw new Error("Runner not found.");
    await admin.from("agent_runner_credentials").delete().eq("runner_id", r.id);
    await admin.from("agent_tasks").update({ status: "expired" }).eq("runner_id", r.id).in("status", ["queued", "claimed"]);
    await admin.from("agent_workspaces").delete().eq("runner_id", r.id);
    await admin.from("agent_runners").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("id", r.id);
    return { ok: true };
  });

export const setDefaultWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireActive(context);
    const { data: w } = await admin.from("agent_workspaces").select("id").eq("id", data.workspaceId).eq("user_id", context.userId).maybeSingle();
    if (!w) throw new Error("Workspace not found.");
    await admin.from("agent_workspaces").update({ is_default: false }).eq("user_id", context.userId);
    await admin.from("agent_workspaces").update({ is_default: true }).eq("id", w.id);
    return { ok: true };
  });

export const setToolPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    group: z.enum(TOOL_GROUPS.map((g) => g.id) as [ToolGroup, ...ToolGroup[]]),
    mode: z.enum(["disabled", "ask_every_time", "auto_allow"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireActive(context);
    await admin.from("agent_tool_permissions").delete().eq("user_id", context.userId).is("workspace_id", null).eq("tool_name", data.group);
    const { error } = await admin.from("agent_tool_permissions").insert({ user_id: context.userId, workspace_id: null, tool_name: data.group, permission_mode: data.mode });
    if (error) throw new Error("Couldn't save the permission.");
    return { ok: true };
  });

export const setAgentPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ agentDefault: z.boolean().optional(), autoContinue: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireActive(context);
    const patch: { agent_mode_default?: boolean; agent_auto_continue?: boolean } = {};
    if (data.agentDefault !== undefined) patch.agent_mode_default = data.agentDefault;
    if (data.autoContinue !== undefined) patch.agent_auto_continue = data.autoContinue;
    await admin.from("profiles").update(patch).eq("id", context.userId);
    return { ok: true };
  });

/** Approve/deny a pending tool step. Only the run owner can resolve it, and only while pending and unexpired. */
export const resolveApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ approvalId: z.string().uuid(), decision: z.enum(["approved", "denied"]), alwaysAllow: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireActive(context);
    const { data: ap } = await admin.from("agent_approvals").select("id, user_id, status, expires_at").eq("id", data.approvalId).maybeSingle();
    if (!ap || ap.user_id !== context.userId) throw new Error("Approval not found.");
    if (ap.status !== "pending") throw new Error("This request was already handled.");
    if (ap.expires_at && new Date(ap.expires_at).getTime() < Date.now()) throw new Error("This approval request expired.");
    await admin.from("agent_approvals").update({ status: data.decision, always_allow: data.decision === "approved" && !!data.alwaysAllow, resolved_at: new Date().toISOString() })
      .eq("id", ap.id).eq("status", "pending");
    return { ok: true };
  });

/** Queues a stop for every managed dev server on the user's runners. */
export const stopAllDevServers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireActive(context);
    const { data: servers } = await admin.from("managed_dev_servers").select("id, runner_id, process_identifier").eq("user_id", context.userId).in("status", ["starting", "running"]);
    for (const s of servers ?? []) {
      if (!s.process_identifier) continue;
      await admin.from("agent_tasks").insert({ runner_id: s.runner_id, user_id: context.userId, tool_name: "stop_dev_server", args: { server_id: s.process_identifier } });
    }
    return { queued: servers?.length ?? 0 };
  });

/** Real native tool-calling probe for a model; the result is saved on the model. */
export const probeModelTools = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ modelId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireActive(context);
    const { data: model } = await context.supabase.from("models").select("id, provider_model_id, connection_id, supports_tool_calls").eq("id", data.modelId).maybeSingle();
    if (!model) throw new Error("Model not found.");
    const { data: conn } = await admin.from("connections").select("provider_type, base_url, encrypted_api_key, enabled").eq("id", model.connection_id).maybeSingle();
    const { TOOL_PROVIDERS, probeToolCalling } = await import("./agent-stream.server");
    type P = (typeof TOOL_PROVIDERS)[number];
    if (!conn?.enabled || !TOOL_PROVIDERS.includes(conn.provider_type as P)) {
      await admin.from("models").update({ supports_tool_calls: false }).eq("id", model.id);
      return { supported: false };
    }
    const { decryptApiKey } = await import("./connections.server");
    const supported = await probeToolCalling({ provider: conn.provider_type as P, baseUrl: conn.base_url, apiKey: await decryptApiKey(conn.encrypted_api_key), model: model.provider_model_id });
    await admin.from("models").update({ supports_tool_calls: supported }).eq("id", model.id);
    return { supported };
  });
