// Server-only relay between the orchestrator and a user's connected Agent Runner.
// The runner polls /api/public/runner/poll over outbound HTTPS; the orchestrator waits for the result row.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;

export async function sha256Hex(value: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A runner is "online" if it heartbeated within this window. */
export const ONLINE_WINDOW_MS = 45_000;

export function isOnline(lastSeen: string | null): boolean {
  return !!lastSeen && Date.now() - new Date(lastSeen).getTime() < ONLINE_WINDOW_MS;
}

/** Authenticates a runner bearer token; returns the runner row or null. */
export async function authRunner(admin: Admin, request: Request) {
  const h = request.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (token.length < 20 || token.length > 200) return null;
  const hash = await sha256Hex(token);
  const { data: cred } = await admin.from("agent_runner_credentials").select("runner_id").eq("token_hash", hash).maybeSingle();
  if (!cred) return null;
  const { data: runner } = await admin.from("agent_runners").select("id, user_id, status").eq("id", cred.runner_id).maybeSingle();
  if (!runner || runner.status === "revoked") return null;
  return runner;
}

export type ToolResult = { success: boolean; data?: unknown; error?: { type: string; message: string } };

/** Queues a task and waits for the runner's result (or a structured error). */
export async function runOnRunner(admin: Admin, t: {
  runnerId: string; userId: string; stepId: string; workspaceRoot: string | null; tool: string; args: Record<string, unknown>;
  timeoutSeconds: number; signal: AbortSignal;
}): Promise<ToolResult> {
  const { data: task, error } = await admin.from("agent_tasks").insert({
    runner_id: t.runnerId, user_id: t.userId, tool_step_id: t.stepId, workspace_root: t.workspaceRoot,
    tool_name: t.tool, args: t.args as Json, expires_at: new Date(Date.now() + (t.timeoutSeconds + 60) * 1000).toISOString(),
  }).select("id").single();
  if (error || !task) return { success: false, error: { type: "RELAY_ERROR", message: "Couldn't queue the task for the runner." } };
  const deadline = Date.now() + (t.timeoutSeconds + 30) * 1000;
  let delay = 400;
  while (Date.now() < deadline) {
    if (t.signal.aborted) {
      await admin.from("agent_tasks").update({ status: "expired" }).eq("id", task.id).in("status", ["queued", "claimed"]);
      return { success: false, error: { type: "STOPPED", message: "The run was stopped." } };
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.4, 1500);
    const { data: row } = await admin.from("agent_tasks").select("status, result, claimed_at").eq("id", task.id).maybeSingle();
    if (!row) break;
    if (row.status === "complete" || row.status === "failed") {
      const r = row.result as ToolResult | null;
      return r && typeof r === "object" && "success" in r ? r : { success: false, error: { type: "BAD_RESULT", message: "The runner returned an invalid result." } };
    }
    if (row.status === "queued" && Date.now() - deadline + (t.timeoutSeconds + 30) * 1000 > 20_000) {
      // Not picked up within 20s → runner is effectively offline.
      const { data: runner } = await admin.from("agent_runners").select("last_seen_at").eq("id", t.runnerId).maybeSingle();
      if (!isOnline(runner?.last_seen_at ?? null)) {
        await admin.from("agent_tasks").update({ status: "expired" }).eq("id", task.id).eq("status", "queued");
        return { success: false, error: { type: "RUNNER_DISCONNECTED", message: "The Agent Runner is not connected. Start it and try again." } };
      }
    }
  }
  await admin.from("agent_tasks").update({ status: "expired" }).eq("id", task.id).in("status", ["queued", "claimed"]);
  return { success: false, error: { type: "TIMEOUT", message: "The tool did not finish in time." } };
}

const SECRETISH = /(sk-[A-Za-z0-9_-]{16,}|cc_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|xox[abp]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/g;

/** Redacts secret-looking strings and truncates large values before storage/model use. */
export function sanitize(value: unknown, maxChars: number): unknown {
  const s = JSON.stringify(value ?? null).replace(SECRETISH, "[REDACTED]");
  if (s.length <= maxChars) return JSON.parse(s) as unknown;
  return { truncated: true, preview: s.slice(0, maxChars) };
}
