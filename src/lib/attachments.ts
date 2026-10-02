export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export type SafePreview = "image" | "pdf" | "plain_text" | "csv" | "audio" | "video" | "none";

export interface AttachmentRow {
  id: string;
  chat_id: string | null;
  message_id: string | null;
  original_filename: string;
  mime_type: string | null;
  size_bytes: number;
  safe_preview_type: string | null;
  processing_status: string;
  attachment_type?: string;
  created_at: string;
  extraction?: AttachmentExtraction | null;
}

export interface AttachmentExtraction { extraction_status: string; error_message: string | null }

export const VISION_MIME = ["image/png", "image/jpeg", "image/webp"];
export const isVisionImage = (mime: string | null | undefined) => VISION_MIME.includes((mime ?? "").toLowerCase());
const ANALYZABLE_EXT = /\.(txt|log|md|markdown|csv|json|pdf|docx|xlsx)$/i;
/** Client-side hint only; the server re-checks with its own allow-list. */
export const isAnalyzable = (name: string) => ANALYZABLE_EXT.test(name);
export const NOT_ANALYZABLE = "File uploaded successfully, but AI analysis is not available for this format.";

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const clean = base.normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").replace(/^[._]+/, "").slice(0, 120);
  return clean || "file";
}

const IMAGE_OK = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp"]);
const AUDIO_OK = /^audio\/(mpeg|mp4|ogg|wav|webm|aac|x-wav|flac)$/;
const VIDEO_OK = /^video\/(mp4|webm|ogg)$/;
const TEXT_EXT = /\.(txt|md|markdown|log)$/i;

/** Allow-list only. SVG/HTML/JS and everything unknown → "none" (download only). */
export function previewTypeFor(mime: string | null, filename: string): SafePreview {
  const m = (mime ?? "").toLowerCase();
  if (IMAGE_OK.has(m)) return "image";
  if (m === "application/pdf") return "pdf";
  if (m === "text/csv" || /\.csv$/i.test(filename)) return "csv";
  if (m === "text/plain" || m === "text/markdown" || TEXT_EXT.test(filename)) return "plain_text";
  if (AUDIO_OK.test(m)) return "audio";
  if (VIDEO_OK.test(m)) return "video";
  return "none";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}
