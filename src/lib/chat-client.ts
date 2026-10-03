import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AgentStepEvent } from "@/lib/agent-tools";

export interface StreamState {
  messageId: string | null;
  pendingUserText: string | null;
  text: string;
  status: "idle" | "submitted" | "streaming";
  /** Agent Mode tool activity for the in-flight response. */
  steps: AgentStepEvent[];
}

export interface SendArgs { chatId: string; modelId: string; message?: string; regenerate?: boolean; attachmentIds?: string[]; contextAttachmentIds?: string[]; agent?: boolean; continueRun?: boolean; workspaceId?: string | null }

const STREAM_FAILED = "Unable to stream this response. Your message was saved; try regenerating.";

/** Client for the chat-completion SSE endpoint. Calls onSettled after any terminal outcome. */
export function useChatStream(onSettled: () => void, onError: (message: string) => void) {
  const [state, setState] = useState<StreamState>({ messageId: null, pendingUserText: null, text: "", status: "idle", steps: [] });
  const abortRef = useRef<AbortController | null>(null);
  const frameRef = useRef<number | null>(null);
  const busy = state.status !== "idle";

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  const send = useCallback(async (args: SendArgs) => {
    if (abortRef.current) return; // duplicate-submit guard
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ messageId: null, pendingUserText: args.regenerate ? null : args.message ?? null, text: "", status: "submitted", steps: [] });
    let messageId: string | null = null;
    let text = "";
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Please sign in again.");
      const { agent, continueRun, workspaceId, ...chatArgs } = args;
      const res = await fetch(agent ? "/api/agent-completion" : "/api/chat-completion", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(agent
          ? { chatId: args.chatId, modelId: args.modelId, message: args.message, continueRun, workspaceId, requestId: crypto.randomUUID() }
          : { ...chatArgs, requestId: crypto.randomUUID() }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const body: unknown = await res.json().catch(() => null);
        const msg = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : STREAM_FAILED;
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const event = block.match(/^event: (.+)$/m)?.[1];
          const raw = block.match(/^data: (.+)$/m)?.[1];
          if (!event || !raw) continue;
          const payload = JSON.parse(raw) as { messageId?: string; text?: string; message?: string };
          if (payload.messageId) messageId = payload.messageId;
          if (event === "delta" && payload.text) {
            text += payload.text;
             if (frameRef.current === null) {
               frameRef.current = requestAnimationFrame(() => {
                 frameRef.current = null;
                 setState((s) => ({ ...s, messageId, text, status: "streaming" }));
               });
             }
          } else if (event === "step") {
            const st = JSON.parse(raw) as AgentStepEvent;
            setState((s) => {
              const i = s.steps.findIndex((x) => x.id === st.id);
              const steps = i >= 0 ? s.steps.map((x, j) => (j === i ? { ...x, ...st } : x)) : [...s.steps, st];
              return { ...s, messageId, status: "streaming", steps };
            });
          } else if (event === "error") {
            onError(payload.message ?? STREAM_FAILED);
          }
        }
      }
    } catch (e) {
      if (ctrl.signal.aborted) {
        // Persist partial output client-side too (server write is best-effort on abort).
        if (messageId) {
          await supabase.from("messages").update({ content: text, status: "stopped" }).eq("id", messageId).eq("status", "streaming");
        }
      } else {
        onError(e instanceof Error && e.message ? e.message : STREAM_FAILED);
      }
    } finally {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      abortRef.current = null;
      setState({ messageId: null, pendingUserText: null, text: "", status: "idle", steps: [] });
      onSettled();
    }
  }, [onSettled, onError]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { state, busy, send, stop };
}
