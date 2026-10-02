import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

// The ONLY code path that calls AI providers for chat. Streams normalized SSE:
//   event: delta    { messageId, text }
//   event: complete { messageId, finishReason, inputTokens?, outputTokens? }
//   event: error    { messageId?, code, message }

const MAX_MESSAGE_CHARS = 32_000;
const MAX_HISTORY_CHARS = 120_000;
const MAX_HISTORY_MESSAGES = 60;
const RATE_LIMIT_PER_MINUTE = 20;

const inputSchema = z.object({
  chatId: z.string().uuid(),
  modelId: z.string().uuid(),
  message: z.string().max(MAX_MESSAGE_CHARS).optional(),
  regenerate: z.boolean().optional(),
  requestId: z.string().min(8).max(100),
  systemPrompt: z.string().max(20_000).nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  maxTokens: z.number().int().min(1).max(1_000_000).nullable().optional(),
  topP: z.number().gt(0).max(1).nullable().optional(),
  attachmentIds: z.array(z.string().uuid()).max(20).optional(),
}).refine((d) => d.regenerate || (d.message && d.message.trim().length > 0), { message: "Message is required" });

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
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

function autoTitle(text: string): string {
  const line = text.split(/\r?\n/).map((l) => l.trim()).find((l) => /[\p{L}\p{N}]/u.test(l)) ?? text.trim();
  const clean = line.replace(/\s+/g, " ").replace(/^[#>*\-\s`]+/, "");
  if (clean.length <= 48) return clean || "New chat";
  const cut = clean.slice(0, 48);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 24 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

export const Route = createFileRoute("/api/chat-completion")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // --- Origin allow-list (no CORS headers are ever sent, so no wildcard) ---
        const origin = request.headers.get("origin");
        if (origin) {
          const allowed = new Set([new URL(request.url).origin]);
          (process.env["APP_ORIGIN"] ?? "").split(",").map((o) => o.trim()).filter(Boolean).forEach((o) => allowed.add(o));
          if (!allowed.has(origin)) return json(403, "forbidden_origin", "This origin is not allowed.");
        }
        // --- Auth ---
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token || token.split(".").length !== 3) return json(401, "unauthorized", "Please sign in again.");
        const sb = userClient(token);
        const { data: userData, error: userErr } = await sb.auth.getUser(token);
        if (userErr || !userData.user) return json(401, "unauthorized", "Please sign in again.");
        const userId = userData.user.id;

        const { data: active } = await sb.rpc("is_active_approved_user");
        if (active !== true) return json(403, "account_inactive", "Your account isn't approved or is disabled.");

        // --- Input ---
        let input: z.infer<typeof inputSchema>;
        try { input = inputSchema.parse(await request.json()); } catch { return json(400, "bad_request", "Invalid request."); }

        // --- Ownership (RLS-scoped + explicit check) ---
        const { data: chat } = await sb.from("chats").select("id, user_id, title, system_prompt, temperature, max_tokens, top_p").eq("id", input.chatId).maybeSingle();
        if (!chat || chat.user_id !== userId) return json(404, "chat_not_found", "This chat no longer exists.");

        // Model must be enabled and visible to the user (RLS hides disabled connections).
        const { data: model } = await sb.from("models").select("id, provider_model_id, enabled, connection_id").eq("id", input.modelId).maybeSingle();
        if (!model || !model.enabled) return json(404, "model_unavailable", "This model is no longer available. Choose another model.");
        const { data: canView } = await sb.rpc("can_view_connection", { _connection_id: model.connection_id });
        if (canView !== true) return json(404, "model_unavailable", "This model is no longer available. Choose another model.");

        // --- Rate limit: user messages across the user's chats in the last minute ---
        const since = new Date(Date.now() - 60_000).toISOString();
        const { data: myChats } = await sb.from("chats").select("id").eq("user_id", userId);
        const chatIds = (myChats ?? []).map((c) => c.id);
        if (chatIds.length) {
          const { count } = await sb.from("messages").select("id", { count: "exact", head: true })
            .in("chat_id", chatIds).eq("role", "assistant").gte("created_at", since);
          if ((count ?? 0) >= RATE_LIMIT_PER_MINUTE) return json(429, "rate_limited", "You're sending messages too quickly. Wait a moment and try again.");
        }

        // --- Block concurrent streams in this chat ---
        const { data: inflight } = await sb.from("messages").select("id, created_at").eq("chat_id", chat.id).eq("status", "streaming")
          .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString()).limit(1);
        if (inflight?.length) return json(409, "busy", "A response is already being generated in this chat.");

        // --- Validate attachments: owned by this user, in this chat, not yet linked ---
        const attachmentIds = input.regenerate ? [] : [...new Set(input.attachmentIds ?? [])];
        if (attachmentIds.length) {
          const { data: atts } = await sb.from("chat_attachments").select("id, user_id, chat_id, message_id, processing_status").in("id", attachmentIds);
          const ok = (atts ?? []).filter((a) => a.user_id === userId && a.chat_id === chat.id && !a.message_id && a.processing_status === "uploaded");
          if (ok.length !== attachmentIds.length) return json(400, "bad_attachment", "One or more attachments are unavailable. Remove them and try again.");
        }

        // --- Persist user message (idempotent by requestId) ---
        const { count: priorUser } = await sb.from("messages").select("id", { count: "exact", head: true }).eq("chat_id", chat.id).eq("role", "user");
        if (!input.regenerate) {
          const { data: userMsg, error } = await sb.from("messages").insert({
            chat_id: chat.id, role: "user", content: input.message!.trim(), client_request_id: input.requestId,
          }).select("id").single();
          if (error || !userMsg) {
            if (error?.code === "23505") return json(409, "duplicate", "This message was already sent.");
            console.error("save user message failed", error?.code);
            return json(500, "save_failed", "Couldn't save your message. Please try again.");
          }
          if (attachmentIds.length) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin.from("chat_attachments").update({ message_id: userMsg.id })
              .in("id", attachmentIds).eq("user_id", userId).eq("chat_id", chat.id).is("message_id", null);
          }
          if ((priorUser ?? 0) === 0 && chat.title === "New chat") {
            await sb.from("chats").update({ title: autoTitle(input.message!) }).eq("id", chat.id);
          }
        }
        // Persist model selection on the chat.
        await sb.from("chats").update({ selected_model_id: model.id, selected_connection_id: model.connection_id }).eq("id", chat.id);

        // --- History ---
        const { data: rows } = await sb.from("messages").select("role, content, status").eq("chat_id", chat.id)
          .order("created_at", { ascending: false }).limit(MAX_HISTORY_MESSAGES * 2);
        let ordered = (rows ?? []).reverse()
          .filter((m) => (m.role === "user" || m.role === "assistant") && m.status !== "error" && m.status !== "streaming" && m.content.trim());
        if (input.regenerate) {
          while (ordered.length && ordered[ordered.length - 1]!.role === "assistant") ordered = ordered.slice(0, -1);
        }
        const history: { role: "user" | "assistant"; content: string }[] = [];
        let total = 0;
        for (let i = ordered.length - 1; i >= 0 && history.length < MAX_HISTORY_MESSAGES; i--) {
          const m = ordered[i]!;
          if (total + m.content.length > MAX_HISTORY_CHARS && history.length > 0) break;
          total += m.content.length;
          history.unshift({ role: m.role as "user" | "assistant", content: m.content.slice(0, MAX_HISTORY_CHARS) });
        }
        while (history.length && history[0]!.role !== "user") history.shift();
        if (!history.length || history[history.length - 1]!.role !== "user") return json(400, "nothing_to_answer", "There's no message to respond to.");

        // --- Assistant placeholder ---
        const { data: assistant, error: aErr } = await sb.from("messages")
          .insert({ chat_id: chat.id, role: "assistant", content: "", status: "streaming", model_id: model.id }).select("id").single();
        if (aErr || !assistant) return json(500, "save_failed", "Couldn't start the response. Please try again.");
        const messageId = assistant.id;

        // --- Load connection + decrypt key (server only) ---
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: conn } = await supabaseAdmin.from("connections")
          .select("provider_type, base_url, encrypted_api_key, enabled").eq("id", model.connection_id).maybeSingle();
        const { decryptApiKey } = await import("@/lib/connections.server");
        const { streamChat, ChatStreamError, FRIENDLY_ERRORS } = await import("@/lib/chat-stream.server");
        type Provider = Parameters<typeof streamChat>[0]["provider"];

        const settings = {
          system: input.systemPrompt !== undefined ? input.systemPrompt : chat.system_prompt,
          temperature: input.temperature !== undefined ? input.temperature : chat.temperature,
          maxTokens: input.maxTokens !== undefined ? input.maxTokens : chat.max_tokens,
          topP: input.topP !== undefined ? input.topP : chat.top_p,
        };

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            let content = "";
            let closed = false;
            const send = (event: string, data: unknown) => {
              if (closed) return;
              try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { closed = true; }
            };
            const finish = async (patch: Database["public"]["Tables"]["messages"]["Update"]) => {
              await sb.from("messages").update({ content, ...patch }).eq("id", messageId);
            };
            try {
              if (!conn || !conn.enabled) throw new ChatStreamError("model_unavailable");
              const apiKey = await decryptApiKey(conn.encrypted_api_key);
              const result = await streamChat({
                provider: conn.provider_type as Provider, baseUrl: conn.base_url, apiKey,
                model: model.provider_model_id, system: settings.system?.trim() || null, messages: history,
                temperature: settings.temperature, topP: settings.topP, maxTokens: settings.maxTokens, signal: request.signal,
              }, (text) => { content += text; send("delta", { messageId, text }); });
              await finish({ status: "complete", input_tokens: result.inputTokens ?? null, output_tokens: result.outputTokens ?? null });
              send("complete", { messageId, finishReason: result.finishReason, inputTokens: result.inputTokens, outputTokens: result.outputTokens });
            } catch (e) {
              if (request.signal.aborted) {
                await finish({ status: "stopped" }).catch(() => undefined);
              } else {
                const code = e instanceof ChatStreamError ? e.code : "stream_failed";
                if (!(e instanceof ChatStreamError)) console.error("chat-completion internal failure");
                const message = FRIENDLY_ERRORS[code];
                await finish({ status: "error", error_message: message }).catch(() => undefined);
                send("error", { messageId, code, message });
              }
            } finally {
              if (!closed) { closed = true; try { controller.close(); } catch { /* already closed */ } }
            }
          },
        });

        return new Response(stream, {
          headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
        });
      },
    },
  },
});
