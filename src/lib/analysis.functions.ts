import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "chat-attachments";
const EXTRACTS_PER_HOUR = 60;

/** extract-attachment-content: reads a private attachment server-side and stores bounded, safe text. */
export const extractAttachmentContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ attachmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: active } = await supabase.rpc("is_active_approved_user");
    if (active !== true) throw new Error("Your account isn't approved or is disabled.");

    const { data: att } = await supabase.from("chat_attachments")
      .select("id, user_id, chat_id, storage_path, original_filename, mime_type, size_bytes, processing_status")
      .eq("id", data.attachmentId).eq("user_id", userId).maybeSingle();
    if (!att || att.processing_status === "deleted") throw new Error("File not found.");
    if (att.chat_id) {
      const { data: chat } = await supabase.from("chats").select("id").eq("id", att.chat_id).eq("user_id", userId).maybeSingle();
      if (!chat) throw new Error("File not found.");
    }

    const { extract, extractKind, UNSUPPORTED_MESSAGE, MAX_EXTRACT_INPUT_BYTES } = await import("./extraction.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = () => new Date().toISOString();
    const save = async (row: { extraction_status: "processing" | "complete" | "unsupported" | "failed"; extracted_text?: string | null; structured_metadata?: Record<string, unknown>; source_map?: Record<string, unknown>; error_message?: string | null }) => {
      await supabaseAdmin.from("attachment_extractions").upsert({
        attachment_id: att.id, user_id: userId, updated_at: now(),
        extracted_text: null, structured_metadata: {}, source_map: {}, error_message: null, ...row,
      } as never, { onConflict: "attachment_id" });
    };

    const kind = extractKind(att.original_filename, att.mime_type);
    if (!kind) { await save({ extraction_status: "unsupported", error_message: UNSUPPORTED_MESSAGE }); return { status: "unsupported" as const, message: UNSUPPORTED_MESSAGE }; }
    if (att.size_bytes > MAX_EXTRACT_INPUT_BYTES) {
      const m = "This file is too large for AI analysis (limit 20 MB). It's still available to download.";
      await save({ extraction_status: "unsupported", error_message: m });
      return { status: "unsupported" as const, message: m };
    }

    const { data: existing } = await supabaseAdmin.from("attachment_extractions").select("extraction_status, updated_at").eq("attachment_id", att.id).maybeSingle();
    if (existing?.extraction_status === "complete") return { status: "complete" as const, message: null };
    if (existing?.extraction_status === "processing" && Date.now() - new Date(existing.updated_at).getTime() < 120_000) return { status: "processing" as const, message: null };

    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await supabaseAdmin.from("tool_runs").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("tool_name", "extract_attachment").gte("created_at", since);
    if ((count ?? 0) >= EXTRACTS_PER_HOUR) throw new Error("You've analyzed a lot of files recently. Try again later.");

    const { data: run } = await supabaseAdmin.from("tool_runs").insert({
      user_id: userId, chat_id: att.chat_id, tool_name: "extract_attachment", status: "running",
      input_summary: { attachment_id: att.id, kind, size_bytes: att.size_bytes },
    }).select("id").single();
    await save({ extraction_status: "processing" });

    try {
      const { data: blob, error } = await supabaseAdmin.storage.from(BUCKET).download(att.storage_path);
      if (error || !blob) throw new Error("download");
      const r = await extract(new Uint8Array(await blob.arrayBuffer()), att.original_filename, att.mime_type);
      await save({
        extraction_status: r.status, extracted_text: r.status === "complete" ? r.text : null,
        structured_metadata: r.metadata, source_map: { segments: r.segments }, error_message: r.error ?? null,
      });
      if (run) await supabaseAdmin.from("tool_runs").update({
        status: r.status === "failed" ? "failed" : "complete", error_message: r.error ?? null, updated_at: now(),
        output_summary: { status: r.status, chars: r.text.length, segments: r.segments.length },
      }).eq("id", run.id);
      return { status: r.status, message: r.error ?? null };
    } catch {
      console.error("extract-attachment internal failure");
      const m = "This file couldn't be analyzed. Please try again.";
      await save({ extraction_status: "failed", error_message: m });
      if (run) await supabaseAdmin.from("tool_runs").update({ status: "failed", error_message: m, updated_at: now() }).eq("id", run.id);
      return { status: "failed" as const, message: m };
    }
  });

/** get-tool-run-status: owner-scoped (RLS) status lookup. */
export const getToolRunStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: run } = await context.supabase.from("tool_runs").select("id, tool_name, status, output_summary, error_message, updated_at")
      .eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    if (!run) throw new Error("Tool run not found.");
    return { id: run.id, tool: run.tool_name, status: run.status, error: run.error_message, output: JSON.parse(JSON.stringify(run.output_summary ?? {})) as Record<string, string | number | boolean | null> };
  });
