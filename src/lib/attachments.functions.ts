import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MAX_ATTACHMENT_BYTES, previewTypeFor, sanitizeFilename, type AttachmentRow } from "@/lib/attachments";

const BUCKET = "chat-attachments";
const DOWNLOAD_TTL_SECONDS = 300;

type Ctx = { supabase: { rpc: (fn: "is_active_approved_user") => PromiseLike<{ data: boolean | null }> }; userId: string };

async function assertActive(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("is_active_approved_user");
  if (data !== true) throw new Error("Your account isn't approved or is disabled.");
}

const COLS = "id, chat_id, message_id, original_filename, mime_type, size_bytes, safe_preview_type, processing_status, created_at";

export const createAttachmentUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    filename: z.string().min(1).max(500),
    size: z.number().int().min(0).max(MAX_ATTACHMENT_BYTES),
    chatId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertActive(context);
    const { data: chat } = await context.supabase.from("chats").select("id").eq("id", data.chatId).eq("user_id", context.userId).maybeSingle();
    if (!chat) throw new Error("This chat no longer exists.");
    const month = new Date().toISOString().slice(0, 7);
    const path = `user/${context.userId}/${month}/${crypto.randomUUID()}-${sanitizeFilename(data.filename)}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !signed) throw new Error("Couldn't prepare the upload. Please try again.");
    return { path, uploadUrl: signed.signedUrl };
  });

export const completeAttachmentUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    path: z.string().min(10).max(1000),
    filename: z.string().min(1).max(500),
    mimeType: z.string().max(255).nullable(),
    chatId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }): Promise<AttachmentRow> => {
    await assertActive(context);
    const prefix = `user/${context.userId}/`;
    if (!data.path.startsWith(prefix) || data.path.includes("..")) throw new Error("Invalid upload.");
    const { data: chat } = await context.supabase.from("chats").select("id").eq("id", data.chatId).eq("user_id", context.userId).maybeSingle();
    if (!chat) throw new Error("This chat no longer exists.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rest = data.path.slice(prefix.length);
    const dir = `${prefix}${rest.split("/")[0]}`;
    const name = rest.split("/").slice(1).join("/");
    const { data: list } = await supabaseAdmin.storage.from(BUCKET).list(dir, { search: name, limit: 5 });
    const obj = list?.find((o) => o.name === name);
    const size = Number((obj?.metadata as { size?: number } | null)?.size ?? -1);
    if (!obj || size < 0) throw new Error("Upload not found. Please try again.");
    if (size > MAX_ATTACHMENT_BYTES) {
      await supabaseAdmin.storage.from(BUCKET).remove([data.path]);
      throw new Error("File is larger than 50 MB.");
    }
    const mime = data.mimeType?.trim() || null;
    const { data: row, error } = await supabaseAdmin.from("chat_attachments").insert({
      user_id: context.userId, chat_id: data.chatId, storage_path: data.path,
      original_filename: data.filename.slice(0, 500), mime_type: mime, size_bytes: size,
      safe_preview_type: previewTypeFor(mime, data.filename),
    }).select(COLS).single();
    if (error || !row) {
      if (error?.code !== "23505") await supabaseAdmin.storage.from(BUCKET).remove([data.path]);
      throw new Error("Couldn't save the attachment. Please try again.");
    }
    return row as AttachmentRow;
  });

export const getAttachmentDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), download: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertActive(context);
    // RLS: owner (or admin) only.
    const { data: row } = await context.supabase.from("chat_attachments").select("storage_path, original_filename, processing_status").eq("id", data.id).maybeSingle();
    if (!row || row.processing_status === "deleted" || row.processing_status === "blocked") throw new Error("Attachment not found.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage.from(BUCKET)
      .createSignedUrl(row.storage_path, DOWNLOAD_TTL_SECONDS, data.download ? { download: row.original_filename } : undefined);
    if (error || !signed) throw new Error("Couldn't prepare the download.");
    return { url: signed.signedUrl };
  });

export const deleteAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertActive(context);
    const { data: row } = await context.supabase.from("chat_attachments").select("id, user_id, storage_path").eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    if (!row) throw new Error("Attachment not found.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: sErr } = await supabaseAdmin.storage.from(BUCKET).remove([row.storage_path]);
    if (sErr) throw new Error("Couldn't delete the file. Please try again.");
    await supabaseAdmin.from("chat_attachments").delete().eq("id", row.id).eq("user_id", context.userId);
    return { ok: true };
  });
