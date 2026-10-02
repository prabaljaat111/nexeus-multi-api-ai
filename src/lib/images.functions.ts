import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isImageCaps } from "@/lib/image-catalog";

const BUCKET = "chat-attachments";
const STALE_MS = 6 * 60_000;

const genSchema = z.object({
  chatId: z.string().uuid(),
  modelId: z.string().uuid(),
  prompt: z.string().trim().min(1, "Enter a prompt").max(4000),
  negativePrompt: z.string().trim().max(2000).optional(),
  size: z.string().max(20).optional(),
  aspectRatio: z.string().max(10).optional(),
  quality: z.string().max(20).optional(),
  style: z.string().max(40).optional(),
});

function rateLimit(): number {
  const n = Number(process.env["IMAGE_RATE_LIMIT_PER_HOUR"] ?? "");
  return Number.isInteger(n) && n > 0 ? n : 20;
}

export const generateImageJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => genSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: active } = await supabase.rpc("is_active_approved_user");
    if (active !== true) throw new Error("Your account isn't approved or is disabled.");

    const { data: chat } = await supabase.from("chats").select("id, title").eq("id", data.chatId).eq("user_id", userId).maybeSingle();
    if (!chat) throw new Error("This chat no longer exists.");

    const { data: model } = await supabase.from("models").select("id, provider_model_id, display_name, enabled, connection_id, capabilities").eq("id", data.modelId).maybeSingle();
    const caps = model?.capabilities;
    if (!model || !model.enabled || !isImageCaps(caps)) throw new Error("This model can't generate images. Choose another image model.");
    const { data: canView } = await supabase.rpc("can_view_connection", { _connection_id: model.connection_id });
    if (canView !== true) throw new Error("This model can't generate images. Choose another image model.");

    // Only options the model supports.
    const size = data.size && caps.supported_sizes?.includes(data.size) ? data.size : null;
    const aspectRatio = data.aspectRatio && caps.supported_aspect_ratios?.includes(data.aspectRatio) ? data.aspectRatio : null;
    const quality = data.quality && caps.supported_qualities?.includes(data.quality) ? data.quality : null;
    const style = data.style && caps.supported_styles?.includes(data.style) ? data.style : null;
    const negativePrompt = data.negativePrompt && caps.supports_negative_prompt ? data.negativePrompt : null;
    if ((data.size && !size) || (data.aspectRatio && !aspectRatio) || (data.quality && !quality) || (data.style && !style)) {
      throw new Error("One of the selected options isn't supported by this model.");
    }

    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await supabase.from("image_generation_jobs").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
    if ((count ?? 0) >= rateLimit()) throw new Error("Image generation limit reached. Try again later.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inflight } = await supabaseAdmin.from("image_generation_jobs").select("id").eq("user_id", userId)
      .in("status", ["queued", "generating"]).gte("created_at", new Date(Date.now() - STALE_MS).toISOString()).limit(3);
    if ((inflight?.length ?? 0) >= 2) throw new Error("You already have images generating. Wait for them to finish.");

    const { data: job, error: jErr } = await supabaseAdmin.from("image_generation_jobs").insert({
      user_id: userId, chat_id: chat.id, connection_id: model.connection_id, model_id: model.id,
      prompt: data.prompt, negative_prompt: negativePrompt, size, aspect_ratio: aspectRatio, quality, style, status: "generating",
    }).select("id").single();
    if (jErr || !job) throw new Error("Couldn't start image generation. Please try again.");

    await supabase.from("messages").insert({ chat_id: chat.id, role: "user", content: `Generate image: ${data.prompt}` });
    if (chat.title === "New chat") {
      const t = data.prompt.replace(/\s+/g, " ").slice(0, 48);
      await supabase.from("chats").update({ title: `Image: ${t}` }).eq("id", chat.id);
    }

    const { decryptApiKey } = await import("./connections.server");
    const { generateImage, ImageGenError, IMAGE_ERRORS } = await import("./image-gen.server");
    type Provider = Parameters<typeof generateImage>[0]["provider"];
    const isCancelled = async () => {
      const { data: j } = await supabaseAdmin.from("image_generation_jobs").select("status").eq("id", job.id).single();
      return j?.status === "cancelled";
    };

    try {
      const { data: conn } = await supabaseAdmin.from("connections").select("provider_type, base_url, encrypted_api_key, enabled").eq("id", model.connection_id).maybeSingle();
      if (!conn?.enabled) throw new ImageGenError("provider_unavailable");
      const apiKey = await decryptApiKey(conn.encrypted_api_key);
      const result = await generateImage({
        provider: conn.provider_type as Provider, baseUrl: conn.base_url, apiKey, model: model.provider_model_id,
        prompt: data.prompt, negativePrompt, size, aspectRatio, quality, style, isCancelled,
        onProviderJob: async (id) => { await supabaseAdmin.from("image_generation_jobs").update({ provider_job_id: id.slice(0, 200), updated_at: new Date().toISOString() }).eq("id", job.id); },
      });
      if (await isCancelled()) throw new ImageGenError("cancelled");

      const ext = result.mime === "image/png" ? "png" : result.mime === "image/webp" ? "webp" : "jpg";
      const path = `user/${userId}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-generated.${ext}`;
      const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, result.bytes, { contentType: result.mime, upsert: false });
      if (upErr) throw new Error("storage");

      const { data: msg } = await supabase.from("messages").insert({
        chat_id: chat.id, role: "assistant", content: `Generated image with ${model.display_name}.`, model_id: model.id, status: "complete",
      }).select("id").single();

      const { data: att, error: aErr } = await supabaseAdmin.from("chat_attachments").insert({
        user_id: userId, chat_id: chat.id, message_id: msg?.id ?? null, storage_path: path,
        original_filename: `generated-image.${ext}`, mime_type: result.mime, size_bytes: result.bytes.length,
        attachment_type: "generated_image", safe_preview_type: "image",
      }).select("id").single();
      if (aErr || !att) { await supabaseAdmin.storage.from(BUCKET).remove([path]); throw new Error("storage"); }

      await supabaseAdmin.from("image_generation_jobs").update({
        status: "complete", message_id: msg?.id ?? null, attachment_id: att.id, revised_prompt: result.revisedPrompt, updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      return { jobId: job.id, status: "complete" as const };
    } catch (e) {
      const code = e instanceof ImageGenError ? e.code : null;
      if (!code) console.error("generate-image internal failure");
      const message = code ? IMAGE_ERRORS[code] : "Image generation failed. Please try again.";
      await supabaseAdmin.from("image_generation_jobs").update({
        status: code === "cancelled" ? "cancelled" : "failed", error_message: message, updated_at: new Date().toISOString(),
      }).eq("id", job.id).neq("status", "cancelled");
      throw new Error(message);
    }
  });

export const getImageJobStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: job } = await context.supabase.from("image_generation_jobs").select("id, user_id, status, error_message, updated_at")
      .eq("id", data.jobId).eq("user_id", context.userId).maybeSingle();
    if (!job) throw new Error("Image job not found.");
    if ((job.status === "generating" || job.status === "queued") && Date.now() - new Date(job.updated_at).getTime() > STALE_MS) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const msg = "Image generation timed out. Please try again.";
      await supabaseAdmin.from("image_generation_jobs").update({ status: "failed", error_message: msg, updated_at: new Date().toISOString() }).eq("id", job.id).in("status", ["generating", "queued"]);
      return { status: "failed", error: msg };
    }
    return { status: job.status, error: job.error_message };
  });

export const cancelImageJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: job } = await context.supabase.from("image_generation_jobs").select("id").eq("id", data.jobId).eq("user_id", context.userId).maybeSingle();
    if (!job) throw new Error("Image job not found.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Providers here have no cancel API; we stop polling and discard any late result.
    await supabaseAdmin.from("image_generation_jobs").update({ status: "cancelled", error_message: "Image generation was cancelled.", updated_at: new Date().toISOString() })
      .eq("id", job.id).in("status", ["queued", "generating"]);
    return { ok: true };
  });
