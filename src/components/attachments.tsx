import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Download, ExternalLink, File as FileIcon, FileText, Loader2, RotateCcw, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { MAX_ATTACHMENT_BYTES, formatBytes, type AttachmentRow } from "@/lib/attachments";
import { completeAttachmentUpload, createAttachmentUpload, deleteAttachment, getAttachmentDownloadUrl } from "@/lib/attachments.functions";

export const attachmentKeys = { chat: (chatId: string) => ["attachments", chatId] as const };

export function useChatAttachments(chatId: string) {
  return useQuery({
    queryKey: attachmentKeys.chat(chatId),
    queryFn: async (): Promise<AttachmentRow[]> => {
      const { data, error } = await supabase.from("chat_attachments")
        .select("id, chat_id, message_id, original_filename, mime_type, size_bytes, safe_preview_type, processing_status, attachment_type, created_at")
        .eq("chat_id", chatId).not("message_id", "is", null).order("created_at");
      if (error) throw new Error("Couldn't load attachments.");
      return data;
    },
  });
}

export interface PendingUpload {
  key: string;
  file: File;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string | undefined;
  row?: AttachmentRow;
}

function putWithProgress(url: string, file: File, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.status === 413 ? "File is larger than 50 MB." : "Upload failed.")));
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(file);
  });
}

export function useAttachmentUploads(chatId: string) {
  const [items, setItems] = useState<PendingUpload[]>([]);
  const createFn = useServerFn(createAttachmentUpload);
  const completeFn = useServerFn(completeAttachmentUpload);
  const deleteFn = useServerFn(deleteAttachment);
  const patch = (key: string, p: Partial<PendingUpload>) => setItems((s) => s.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const run = useCallback(async (key: string, file: File) => {
    patch(key, { status: "uploading", progress: 0, error: undefined });
    try {
      const { path, uploadUrl } = await createFn({ data: { filename: file.name, size: file.size, chatId } });
      await putWithProgress(uploadUrl, file, (progress) => patch(key, { progress }));
      const row = await completeFn({ data: { path, filename: file.name, mimeType: file.type || null, chatId } });
      patch(key, { status: "done", progress: 100, row });
    } catch (e) {
      patch(key, { status: "error", error: e instanceof Error ? e.message : "Upload failed." });
    }
  }, [chatId, createFn, completeFn]);

  const add = useCallback((files: FileList | File[]) => {
    const list = Array.from(files);
    for (const file of list) {
      if (file.size > MAX_ATTACHMENT_BYTES) { notify.error(`“${file.name}” is ${formatBytes(file.size)} — the limit is 50 MB.`); continue; }
      const key = crypto.randomUUID();
      setItems((s) => [...s, { key, file, progress: 0, status: "uploading" }]);
      void run(key, file);
    }
  }, [run]);

  const remove = useCallback((key: string) => {
    setItems((s) => {
      const it = s.find((i) => i.key === key);
      if (it?.row) void deleteFn({ data: { id: it.row.id } }).catch(() => undefined);
      return s.filter((i) => i.key !== key);
    });
  }, [deleteFn]);

  const retry = useCallback((key: string) => {
    const it = items.find((i) => i.key === key);
    if (it) void run(key, it.file);
  }, [items, run]);

  const clear = useCallback(() => setItems([]), []);
  useEffect(() => { setItems([]); }, [chatId]);
  return { items, add, remove, retry, clear };
}

export function useAttachmentUrl() {
  const fn = useServerFn(getAttachmentDownloadUrl);
  return useCallback(async (id: string, download: boolean) => (await fn({ data: { id, download } })).url, [fn]);
}

async function openUrl(get: () => Promise<string>, download: boolean) {
  try {
    const url = await get();
    if (download) { const a = document.createElement("a"); a.href = url; a.rel = "noopener"; a.click(); }
    else window.open(url, "_blank", "noopener,noreferrer");
  } catch (e) { notify.fromError(e); }
}

export function PendingChips({ items, onRemove, onRetry }: { items: PendingUpload[]; onRemove: (k: string) => void; onRetry: (k: string) => void }) {
  if (!items.length) return null;
  return (
    <ul className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto px-1 pb-2" aria-label="Attachments">
      {items.map((i) => (
        <li key={i.key} className={cn("flex min-w-0 max-w-full items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs sm:max-w-64", i.status === "error" && "border-destructive/50")}>
          {i.status === "uploading" ? <Loader2 className="size-3.5 shrink-0 animate-spin" /> : i.status === "error" ? <AlertCircle className="size-3.5 shrink-0 text-destructive" /> : <FileIcon className="size-3.5 shrink-0" />}
          <div className="min-w-0">
            <div className="truncate font-medium" title={i.file.name}>{i.file.name}</div>
            <div className={cn("truncate text-muted-foreground", i.status === "error" && "text-destructive")}>
              {i.status === "uploading" ? `${i.progress}% · ${formatBytes(i.file.size)}` : i.status === "error" ? i.error : `${formatBytes(i.file.size)} · ${i.file.type || "file"}`}
            </div>
            {i.status === "uploading" && <div className="mt-0.5 h-0.5 w-full rounded bg-border" role="progressbar" aria-valuenow={i.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${i.file.name}`}><div className="h-full rounded bg-primary transition-all" style={{ width: `${i.progress}%` }} /></div>}
          </div>
          {i.status === "error" && <Button type="button" size="icon" variant="ghost" className="size-6" aria-label={`Retry ${i.file.name}`} onClick={() => onRetry(i.key)}><RotateCcw className="size-3" /></Button>}
          <Button type="button" size="icon" variant="ghost" className="size-6" aria-label={`Remove ${i.file.name}`} onClick={() => onRemove(i.key)}><X className="size-3" /></Button>
        </li>
      ))}
    </ul>
  );
}

function TextPreview({ id }: { id: string }) {
  const getUrl = useAttachmentUrl();
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    getUrl(id, false).then((u) => fetch(u, { headers: { range: "bytes=0-4095" } })).then((r) => r.text())
      .then((t) => { if (live) setText(t.slice(0, 2000)); }, () => undefined);
    return () => { live = false; };
  }, [id, getUrl]);
  if (text === null) return null;
  // Rendered as a text node inside <pre>: never interpreted as HTML.
  return <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-[11px] text-muted-foreground">{text}</pre>;
}

function MediaPreview({ id, kind, name }: { id: string; kind: "image" | "audio" | "video"; name: string }) {
  const getUrl = useAttachmentUrl();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let live = true; getUrl(id, false).then((u) => { if (live) setUrl(u); }, () => undefined); return () => { live = false; }; }, [id, getUrl]);
  if (!url) return <div className="mt-1 h-24 w-full animate-pulse rounded bg-muted" />;
  if (kind === "image") return <img src={url} alt={name} loading="lazy" className="mt-1 max-h-48 max-w-full rounded object-contain" referrerPolicy="no-referrer" />;
  if (kind === "audio") return <audio controls preload="none" src={url} className="mt-1 w-full" />;
  return <video controls preload="metadata" src={url} className="mt-1 max-h-60 w-full rounded" />;
}

export function AttachmentCard({ a, onDeleted }: { a: AttachmentRow; onDeleted: () => void }) {
  const getUrl = useAttachmentUrl();
  const delFn = useServerFn(deleteAttachment);
  const p = a.safe_preview_type ?? "none";
  return (
    <div className="w-full min-w-0 rounded-lg border bg-card p-2 text-xs text-card-foreground sm:w-72">
      <div className="flex items-center gap-2">
        {p === "pdf" || p === "plain_text" || p === "csv" ? <FileText className="size-4 shrink-0 text-muted-foreground" /> : <FileIcon className="size-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium" title={a.original_filename}>{a.original_filename}</div>
          <div className="truncate text-muted-foreground">{formatBytes(a.size_bytes)} · {a.mime_type || "unknown type"}</div>
        </div>
        {p === "pdf" && <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Open PDF" onClick={() => void openUrl(() => getUrl(a.id, false), false)}><ExternalLink className="size-3.5" /></Button>}
        <Button type="button" size="icon" variant="ghost" className="size-7" aria-label={`Download ${a.original_filename}`} onClick={() => void openUrl(() => getUrl(a.id, true), true)}><Download className="size-3.5" /></Button>
        <ConfirmDialog title="Delete this attachment?" description="This file is attached to a message. It will be permanently deleted." confirmLabel="Delete" destructive
          onConfirm={async () => { try { await delFn({ data: { id: a.id } }); notify.success("Attachment deleted"); onDeleted(); } catch (e) { notify.fromError(e); } }}
          trigger={<Button type="button" size="icon" variant="ghost" className="size-7" aria-label={`Delete ${a.original_filename}`}><Trash2 className="size-3.5" /></Button>} />
      </div>
      {(p === "image" || p === "audio" || p === "video") && <MediaPreview id={a.id} kind={p} name={a.original_filename} />}
      {(p === "plain_text" || p === "csv") && <TextPreview id={a.id} />}
    </div>
  );
}

export function MessageAttachments({ items, onDeleted }: { items: AttachmentRow[]; onDeleted: () => void }) {
  if (!items.length) return null;
  return (
    <div className="mt-1.5 flex w-full flex-col items-end gap-1.5">
      {items.map((a) => <AttachmentCard key={a.id} a={a} onDeleted={onDeleted} />)}
      <p className="text-[11px] text-muted-foreground">File attached. AI analysis will be available for supported formats.</p>
    </div>
  );
}

export function useDropZone(onFiles: (f: FileList) => void, enabled: boolean) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const props = enabled ? {
    onDragEnter: (e: React.DragEvent) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); depth.current++; setOver(true); } },
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); },
    onDragLeave: () => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); depth.current = 0; setOver(false); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files); },
  } : {};
  return { over, props };
}
