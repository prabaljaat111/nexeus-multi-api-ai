import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

// generate-code-changes: the only path that calls AI providers for Coding mode.
// SSE events: run {runId} · delta {text} · complete {runId, finish, changeSetId, count} · error {code, message}

const RATE_LIMIT_PER_HOUR = 40;
const MAX_CONTINUATIONS = 6;
const PERSIST_EVERY_MS = 1500;
const MAX_OUTPUT_CHARS = 600_000;
const STALE_MS = 90_000;

const inputSchema = z.object({
  projectId: z.string().uuid(),
  modelId: z.string().uuid(),
  instruction: z.string().trim().max(16_000).optional(),
  selectedPath: z.string().max(300).nullish(),
  continueRunId: z.string().uuid().optional(),
}).refine((d) => d.continueRunId || (d.instruction && d.instruction.length > 0), { message: "Instruction required" });

function json(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ code, message }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

function userClient(token: string) {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => { const h = new Headers(init?.headers); h.set("apikey", key); return fetch(input, { ...init, headers: h }); },
    },
  });
}

export const Route = createFileRoute("/api/code-generation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin) {
          const allowed = new Set([new URL(request.url).origin]);
          (process.env["APP_ORIGIN"] ?? "").split(",").map((o) => o.trim()).filter(Boolean).forEach((o) => allowed.add(o));
          if (!allowed.has(origin)) return json(403, "forbidden_origin", "This origin is not allowed.");
        }
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token || token.split(".").length !== 3) return json(401, "unauthorized", "Please sign in again.");
        const sb = userClient(token);
        const { data: userData, error: userErr } = await sb.auth.getUser(token);
        if (userErr || !userData.user) return json(401, "unauthorized", "Please sign in again.");
        const userId = userData.user.id;
        const { data: active } = await sb.rpc("is_active_approved_user");
        if (active !== true) return json(403, "account_inactive", "Your account isn't approved or is disabled.");

        let input: z.infer<typeof inputSchema>;
        try { input = inputSchema.parse(await request.json()); } catch { return json(400, "bad_request", "Invalid request."); }

        const { data: project } = await sb.from("code_projects").select("id, user_id, title, framework, chat_id").eq("id", input.projectId).maybeSingle();
        if (!project || project.user_id !== userId) return json(404, "not_found", "This project no longer exists.");

        const { data: model } = await sb.from("models").select("id, provider_model_id, display_name, enabled, connection_id, capabilities, max_output_tokens").eq("id", input.modelId).maybeSingle();
        const { isImageCaps } = await import("@/lib/image-catalog");
        if (!model || !model.enabled || isImageCaps(model.capabilities)) return json(404, "model_unavailable", "Choose an available chat model for coding.");
        const { data: canView } = await sb.rpc("can_view_connection", { _connection_id: model.connection_id });
        if (canView !== true) return json(404, "model_unavailable", "Choose an available chat model for coding.");

        const { supabaseAdmin: sa } = await import("@/integrations/supabase/client.server");
        const { data: busy } = await sa.from("code_generation_runs").select("id").eq("project_id", project.id).in("status", ["queued", "planning", "streaming"])
          .gte("updated_at", new Date(Date.now() - STALE_MS).toISOString()).limit(1);
        if (busy?.length) return json(409, "busy", "A generation is already running for this project.");

        const G = await import("@/lib/code-gen.server");
        const S = await import("@/lib/code-shared");
        type Framework = import("@/lib/code-shared").Framework;
        const framework = project.framework as Framework;

        const { data: files } = await sa.from("project_files").select("path, content").eq("project_id", project.id).order("path");

        let runId: string;
        let instruction: string;
        let priorOutput = "";
        let continuationCount = 0;
        if (input.continueRunId) {
          const { data: run } = await sa.from("code_generation_runs").select("id, instruction, output, continuation_count, status, user_id").eq("id", input.continueRunId).eq("project_id", project.id).maybeSingle();
          if (!run || run.user_id !== userId) return json(404, "not_found", "This generation no longer exists.");
          if (run.continuation_count >= MAX_CONTINUATIONS) return json(400, "continuation_limit", "This response has reached the continuation limit. Ask for the remaining work as a new request.");
          runId = run.id; instruction = run.instruction; priorOutput = S.parseCodeOutput(run.output).completeText; continuationCount = run.continuation_count + 1;
          await sa.from("code_change_sets").update({ status: "superseded" }).eq("generation_run_id", run.id).eq("status", "pending");
          await sa.from("code_generation_runs").update({ status: "streaming", continuation_count: continuationCount, finish_reason: null, error_message: null, output: priorOutput, updated_at: new Date().toISOString() }).eq("id", run.id);
        } else {
          const limit = Number(process.env["CODE_RATE_LIMIT_PER_HOUR"] ?? "") || RATE_LIMIT_PER_HOUR;
          const { count } = await sa.from("code_generation_runs").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
          if ((count ?? 0) >= limit) return json(429, "rate_limited", "Your coding generation limit has been reached. Try again later.");
          instruction = input.instruction!;
          let messageId: string | null = null;
          if (project.chat_id) {
            const { data: m } = await sb.from("messages").insert({ chat_id: project.chat_id, role: "user", content: instruction }).select("id").single();
            messageId = m?.id ?? null;
          }
          const { data: run, error } = await sa.from("code_generation_runs").insert({
            user_id: userId, project_id: project.id, chat_id: project.chat_id, message_id: messageId, model_id: model.id, instruction, status: "streaming",
          }).select("id").single();
          if (error || !run) return json(500, "failed", "Couldn't start generation.");
          runId = run.id;
          if (project.title === "Untitled project") await sa.from("code_projects").update({ title: instruction.slice(0, 60) }).eq("id", project.id);
        }

        const context = G.buildProjectContext(files ?? [], instruction, input.selectedPath ?? null);
        const firstUser = `${context}\n\nREQUEST:\n${instruction}`;
        const history: { role: "user" | "assistant"; content: string }[] = [{ role: "user", content: firstUser }];
        if (priorOutput) {
          const parsedPrior = S.parseCodeOutput(priorOutput);
          history.push({ role: "assistant", content: priorOutput });
          history.push({ role: "user", content: G.continuationPrompt(parsedPrior.ops.map((o) => o.path), S.parseCodeOutput(priorOutput + "").partialPath) });
        }
        const maxTokens = model.max_output_tokens ? Math.min(model.max_output_tokens, 64_000) : null;

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start: async (controller) => {
            let closed = false;
            const send = (event: string, data: unknown) => {
              if (closed) return;
              try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { closed = true; }
            };
            send("run", { runId, continuation: continuationCount });
            let out = priorOutput;
            let fresh = "";
            let lastSave = Date.now();
            let repeated = false;
            const ctrl = new AbortController();
            request.signal.addEventListener("abort", () => ctrl.abort());
            const persist = () => sa.from("code_generation_runs").update({ output: out, updated_at: new Date().toISOString() }).eq("id", runId);
            try {
              const { data: conn } = await sa.from("connections").select("provider_type, base_url, encrypted_api_key, enabled").eq("id", model.connection_id).maybeSingle();
              const { streamChat, ChatStreamError, FRIENDLY_ERRORS } = await import("@/lib/chat-stream.server");
              if (!conn?.enabled) throw new ChatStreamError("provider_unavailable");
              const { decryptApiKey } = await import("@/lib/connections.server");
              const apiKey = await decryptApiKey(conn.encrypted_api_key);
              type Provider = Parameters<typeof streamChat>[0]["provider"];
              let result: Awaited<ReturnType<typeof streamChat>>;
              try {
                result = await streamChat({
                  provider: conn.provider_type as Provider, baseUrl: conn.base_url, apiKey, model: model.provider_model_id,
                  system: G.codeSystemPrompt(framework), messages: history, temperature: 0.2, topP: null, maxTokens, signal: ctrl.signal,
                }, (t) => {
                  out += t; fresh += t;
                  send("delta", { text: t });
                  // Repetition guard for continuations: model restarted from the top.
                  if (priorOutput && fresh.length > 400 && !repeated && priorOutput.includes(fresh.slice(0, 400)) && fresh.slice(0, 400).trim().length > 200) { repeated = true; ctrl.abort(); }
                  if (out.length > MAX_OUTPUT_CHARS) ctrl.abort();
                  if (Date.now() - lastSave > PERSIST_EVERY_MS) { lastSave = Date.now(); void persist(); }
                });
              } catch (e) {
                if (ctrl.signal.aborted) {
                  const reason = repeated ? "repeated" : out.length > MAX_OUTPUT_CHARS ? "budget" : "stopped";
                  await sa.from("code_generation_runs").update({
                    output: repeated ? priorOutput : out, status: "stopped", finish_reason: reason, updated_at: new Date().toISOString(),
                    error_message: repeated ? "The model started repeating earlier content, so continuation was stopped." : reason === "budget" ? "This response hit the workspace output budget." : null,
                  }).eq("id", runId);
                  send("complete", { runId, finish: reason, changeSetId: null, count: 0 });
                  return;
                }
                throw e;
              }
              const finish = S.normalizeFinishReason(result.finishReason);
              if (finish === "length") {
                await sa.from("code_generation_runs").update({ output: out, status: "stopped", finish_reason: "length", plan: S.parseCodeOutput(out).plan, updated_at: new Date().toISOString() }).eq("id", runId);
                send("complete", { runId, finish: "length", changeSetId: null, count: 0, continuation: continuationCount });
                return;
              }
              await sa.from("code_generation_runs").update({ output: out, finish_reason: "completed", updated_at: new Date().toISOString() }).eq("id", runId);
              const res = await G.createChangeSetFromOutput(sa, project.id, runId, out);
              if (!res.count) {
                const msg = "The model didn't return file changes in the expected format. Retry, or rephrase the request.";
                await sa.from("code_generation_runs").update({ status: "failed", error_message: msg, updated_at: new Date().toISOString() }).eq("id", runId);
                send("error", { code: "invalid_output", message: msg });
                return;
              }
              if (project.chat_id) {
                const plan = S.parseCodeOutput(out).plan;
                await sb.from("messages").insert({ chat_id: project.chat_id, role: "assistant", model_id: model.id, status: "complete",
                  content: `${plan ? `**Plan**\n${plan}\n\n` : ""}Proposed ${res.count} file change${res.count === 1 ? "" : "s"} for review in the Build workspace.` });
              }
              send("complete", { runId, finish: "completed", changeSetId: res.changeSetId, count: res.count });
            } catch (e) {
              const { ChatStreamError, FRIENDLY_ERRORS } = await import("@/lib/chat-stream.server");
              const code = e instanceof ChatStreamError ? e.code : "stream_failed";
              const message = FRIENDLY_ERRORS[code];
              console.error("code generation failed", code, e instanceof Error ? e.message.slice(0, 300) : "");
              await sa.from("code_generation_runs").update({ output: out, status: out ? "stopped" : "failed", finish_reason: out ? "interrupted" : null, error_message: message, updated_at: new Date().toISOString() }).eq("id", runId);
              send("error", { code, message });
            } finally {
              if (!closed) { closed = true; try { controller.close(); } catch { /* already closed */ } }
            }
          },
        });
        return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", "x-accel-buffering": "no" } });
      },
    },
  },
});
