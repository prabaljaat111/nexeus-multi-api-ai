import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

// Agent Runner relay API. Runners connect outbound; every call except /pair requires the runner token,
// which is stored only as a SHA-256 hash. No user data or secrets are ever returned.

const J = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const pairSchema = z.object({ code: z.string().min(6).max(64), version: z.string().max(40).optional(), platform: z.string().max(80).optional() });
const heartbeatSchema = z.object({
  version: z.string().max(40).optional(), platform: z.string().max(80).optional(),
  workspaces: z.array(z.object({ name: z.string().min(1).max(100), root: z.string().min(1).max(500) })).max(20),
  dev_servers: z.array(z.object({
    id: z.string().max(100), workspace_root: z.string().max(500), command_summary: z.string().max(300),
    pid: z.string().max(40).nullable().optional(), port: z.number().int().nullable().optional(),
    status: z.enum(["starting", "running", "stopped", "failed"]), started_at: z.string().max(40).nullable().optional(),
  })).max(50).optional(),
});
const resultSchema = z.object({ task_id: z.string().uuid(), result: z.object({ success: z.boolean() }).passthrough() });

export const Route = createFileRoute("/api/public/runner/$action")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
        const { authRunner, sha256Hex, randomToken } = await import("@/lib/agent-relay.server");
        const action = params.action;
        let body: unknown;
        try { body = await request.json(); } catch { return J(400, { error: "invalid_json" }); }
        if (JSON.stringify(body).length > 600_000) return J(413, { error: "too_large" });

        if (action === "pair") {
          const p = pairSchema.safeParse(body);
          if (!p.success) return J(400, { error: "invalid_request" });
          const hash = await sha256Hex(p.data.code.trim().toUpperCase());
          const { data: cred } = await admin.from("agent_runner_credentials").select("runner_id, pairing_expires_at").eq("pairing_code_hash", hash).maybeSingle();
          if (!cred || !cred.pairing_expires_at || new Date(cred.pairing_expires_at).getTime() < Date.now()) return J(401, { error: "invalid_or_expired_code" });
          const token = randomToken(32);
          await admin.from("agent_runner_credentials").update({ token_hash: await sha256Hex(token), pairing_code_hash: null, pairing_expires_at: null }).eq("runner_id", cred.runner_id);
          await admin.from("agent_runners").update({ status: "connected", runner_version: p.data.version ?? null, platform: p.data.platform ?? null, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", cred.runner_id);
          return J(200, { runner_id: cred.runner_id, token });
        }

        const runner = await authRunner(admin, request);
        if (!runner) return J(401, { error: "unauthorized" });
        const now = new Date().toISOString();

        if (action === "heartbeat") {
          const p = heartbeatSchema.safeParse(body);
          if (!p.success) return J(400, { error: "invalid_request" });
          await admin.from("agent_runners").update({ status: "connected", last_seen_at: now, updated_at: now, runner_version: p.data.version ?? null, platform: p.data.platform ?? null }).eq("id", runner.id);
          // Workspaces are defined ONLY by the runner's APPROVED_WORKSPACE_ROOTS.
          const { data: existing } = await admin.from("agent_workspaces").select("id, configured_root, is_default").eq("runner_id", runner.id);
          const roots = new Set(p.data.workspaces.map((w) => w.root));
          const stale = (existing ?? []).filter((w) => !roots.has(w.configured_root)).map((w) => w.id);
          if (stale.length) await admin.from("agent_workspaces").delete().in("id", stale);
          const known = new Set((existing ?? []).map((w) => w.configured_root));
          const fresh = p.data.workspaces.filter((w) => !known.has(w.root));
          const { data: anyDefault } = await admin.from("agent_workspaces").select("id").eq("user_id", runner.user_id).eq("is_default", true).limit(1);
          if (fresh.length) {
            await admin.from("agent_workspaces").insert(fresh.map((w, i) => ({ user_id: runner.user_id, runner_id: runner.id, name: w.name, configured_root: w.root, is_default: !anyDefault?.length && i === 0 })));
          }
          if (p.data.dev_servers) {
            const { data: ws } = await admin.from("agent_workspaces").select("id, configured_root").eq("runner_id", runner.id);
            const byRoot = new Map((ws ?? []).map((w) => [w.configured_root, w.id]));
            await admin.from("managed_dev_servers").delete().eq("runner_id", runner.id);
            const rows = p.data.dev_servers.filter((d) => byRoot.has(d.workspace_root)).map((d) => ({
              user_id: runner.user_id, runner_id: runner.id, workspace_id: byRoot.get(d.workspace_root)!, command_summary: d.command_summary,
              process_identifier: d.id, local_port: d.port ?? null, status: d.status, started_at: d.started_at ?? null,
              stopped_at: d.status === "stopped" ? now : null,
            }));
            if (rows.length) await admin.from("managed_dev_servers").insert(rows);
          }
          return J(200, { ok: true });
        }

        if (action === "poll") {
          await admin.from("agent_runners").update({ last_seen_at: now, status: "connected" }).eq("id", runner.id);
          const deadline = Date.now() + 20_000;
          while (Date.now() < deadline) {
            const { data: task } = await admin.from("agent_tasks").select("id, tool_name, args, workspace_root, expires_at")
              .eq("runner_id", runner.id).eq("status", "queued").gt("expires_at", new Date().toISOString()).order("created_at").limit(1).maybeSingle();
            if (task) {
              const { data: claimed } = await admin.from("agent_tasks").update({ status: "claimed", claimed_at: new Date().toISOString() })
                .eq("id", task.id).eq("status", "queued").select("id").maybeSingle();
              if (claimed) return J(200, { task: { id: task.id, tool: task.tool_name, args: task.args, workspace_root: task.workspace_root, expires_at: task.expires_at } });
            }
            if (request.signal.aborted) break;
            await new Promise((r) => setTimeout(r, 1000));
          }
          return J(200, { task: null });
        }

        if (action === "result") {
          const p = resultSchema.safeParse(body);
          if (!p.success) return J(400, { error: "invalid_request" });
          const { data: updated } = await admin.from("agent_tasks").update({
            status: p.data.result.success ? "complete" : "failed", result: p.data.result as unknown as Json, completed_at: now,
          }).eq("id", p.data.task_id).eq("runner_id", runner.id).eq("status", "claimed").select("id").maybeSingle();
          return J(updated ? 200 : 404, { ok: !!updated });
        }

        return J(404, { error: "unknown_action" });
      },
    },
  },
});
