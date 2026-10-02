import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, FilePlus2, FileSpreadsheet, FileText, Loader2, Paperclip, RefreshCw, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useAttachmentUrl } from "@/components/attachments";
import { notify } from "@/lib/toast";
import { formatBytes, type AttachmentRow } from "@/lib/attachments";
import type { ChatMessage } from "@/lib/chats";
import { cancelArtifactJob, generateArtifactJob, reuseArtifactAttachment } from "@/lib/artifacts.functions";
import { deleteAttachment } from "@/lib/attachments.functions";

export type ArtifactFormat = "csv" | "xlsx" | "docx" | "pdf";
export type ContextMode = "conversation" | "message" | "instruction";
export const ARTIFACT_FORMATS: { value: ArtifactFormat; label: string }[] = [
  { value: "pdf", label: "PDF document" }, { value: "docx", label: "Word document (DOCX)" },
  { value: "xlsx", label: "Excel spreadsheet (XLSX)" }, { value: "csv", label: "CSV table" },
];

export interface ArtifactOptions {
  format: ArtifactFormat; contextMode: ContextMode; sourceMessageId?: string | undefined; instruction: string; filename?: string | undefined;
}

interface SheetSummary { name: string; columns: string[]; rowCount: number }
export interface ArtifactJobRow {
  id: string; output_message_id: string | null; output_format: ArtifactFormat; context_mode: ContextMode;
  source_message_id: string | null; instruction: string; requested_filename: string | null; status: string;
  summary: { title?: string; sheets?: SheetSummary[]; sections?: number; blocks?: number } | null;
}

export async function listArtifactJobs(chatId: string): Promise<ArtifactJobRow[]> {
  const { data, error } = await supabase.from("artifact_generation_jobs")
    .select("id, output_message_id, output_format, context_mode, source_message_id, instruction, requested_filename, status, summary")
    .eq("chat_id", chatId).order("created_at");
  if (error) throw new Error("Couldn't load generated files.");
  return data as unknown as ArtifactJobRow[];
}

export function artifactJobToOptions(j: ArtifactJobRow): Partial<ArtifactOptions> {
  return {
    format: j.output_format, contextMode: j.context_mode, instruction: j.instruction,
    sourceMessageId: j.context_mode === "message" ? j.source_message_id ?? undefined : undefined,
    filename: j.requested_filename ?? undefined,
  };
}

export function useArtifactGeneration(chatId: string, modelId: string | null, onSettled: () => void) {
  const gen = useServerFn(generateArtifactJob);
  const cancelFn = useServerFn(cancelArtifactJob);
  const [pending, setPending] = useState<{ jobId: string; format: ArtifactFormat; cancelling: boolean } | null>(null);
  const [failed, setFailed] = useState<{ message: string; options: ArtifactOptions } | null>(null);
  useEffect(() => { setFailed(null); }, [chatId]);
  useEffect(() => { setPending(null); }, [chatId]);

  const generate = useCallback(async (o: ArtifactOptions) => {
    if (pending) return;
    if (!modelId) { notify.error("Choose a model before creating a file."); return; }
    setFailed(null);
    const jobId = crypto.randomUUID();
    setPending({ jobId, format: o.format, cancelling: false });
    try {
      const r = await gen({ data: { jobId, chatId, modelId, ...o } });
      if (r.status === "complete") notify.success(`${o.format.toUpperCase()} file created`);
      else notify.success("File creation cancelled");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      const m = !msg || msg.startsWith("[") ? "File generation failed. Your chat content was not changed." : msg;
      notify.error(m);
      setFailed({ message: m, options: o });
    } finally {
      setPending(null);
      onSettled();
    }
  }, [pending, modelId, gen, chatId, onSettled]);

  const cancel = useCallback(async () => {
    if (!pending) return;
    setPending({ ...pending, cancelling: true });
    try { await cancelFn({ data: { jobId: pending.jobId } }); } catch (e) { notify.fromError(e); }
  }, [pending, cancelFn]);

  return { pending, generate, cancel, failed, dismissFailure: () => setFailed(null) };
}

export function ArtifactProgress({ format, cancelling, onCancel }: { format: ArtifactFormat; cancelling: boolean; onCancel: () => void }) {
  return (
    <div className="flex w-full max-w-md items-center gap-3 rounded-lg border bg-card p-3 text-sm" aria-live="polite">
      <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{cancelling ? "Cancelling…" : `Creating ${format.toUpperCase()} file…`}</div>
        <div className="text-xs text-muted-foreground">The model writes structured content; the file is then built securely on the server.</div>
      </div>
      <Button size="icon" variant="ghost" className="size-7" disabled={cancelling} onClick={onCancel} aria-label="Cancel file creation"><X className="size-4" /></Button>
    </div>
  );
}

const preview = (s: string) => s.replace(/\s+/g, " ").slice(0, 80);

export function ArtifactDialog({ open, onOpenChange, initial, messages, hasModel, onSubmit }: {
  open: boolean; onOpenChange: (o: boolean) => void; initial: Partial<ArtifactOptions> | null;
  messages: ChatMessage[] | undefined; hasModel: boolean; onSubmit: (o: ArtifactOptions) => void;
}) {
  const [format, setFormat] = useState<ArtifactFormat>("pdf");
  const [mode, setMode] = useState<ContextMode>("conversation");
  const [sourceId, setSourceId] = useState("");
  const [instruction, setInstruction] = useState("");
  const [filename, setFilename] = useState("");
  const candidates = (messages ?? []).filter((m) => (m.role === "user" || m.role === "assistant") && m.content.trim()).slice(-30).reverse();

  useEffect(() => {
    if (!open) return;
    setFormat(initial?.format ?? "pdf");
    setMode(initial?.contextMode ?? ((messages?.length ?? 0) > 0 ? "conversation" : "instruction"));
    setSourceId(initial?.sourceMessageId ?? "");
    setInstruction(initial?.instruction ?? "");
    setFilename(initial?.filename ?? "");
  }, [open, initial, messages?.length]);

  const valid = hasModel && !!instruction.trim() && (mode !== "message" || !!sourceId);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onSubmit({ format, contextMode: mode, sourceMessageId: mode === "message" ? sourceId : undefined, instruction: instruction.trim().slice(0, 4000), filename: filename.trim() || undefined });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FilePlus2 className="size-5" />Create file</DialogTitle>
            <DialogDescription>The chat's selected model writes the content; the file is built and stored privately on the server.</DialogDescription>
          </DialogHeader>
          {!hasModel && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">Choose a model before creating a file.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="art-format">File type</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as ArtifactFormat)}>
                <SelectTrigger id="art-format"><SelectValue /></SelectTrigger>
                <SelectContent>{ARTIFACT_FORMATS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="art-source">Use as source</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as ContextMode)}>
                <SelectTrigger id="art-source"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="conversation">Current conversation</SelectItem>
                  <SelectItem value="message" disabled={!candidates.length}>A selected message</SelectItem>
                  <SelectItem value="instruction">Instruction only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {mode === "message" && (
            <div className="space-y-1.5">
              <Label htmlFor="art-msg">Message</Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger id="art-msg"><SelectValue placeholder="Choose a message" /></SelectTrigger>
                <SelectContent>
                  {candidates.map((m) => <SelectItem key={m.id} value={m.id}>{m.role === "user" ? "You" : "AI"}: {preview(m.content)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="art-instr">Instructions</Label>
            <Textarea id="art-instr" rows={4} maxLength={4000} value={instruction} onChange={(e) => setInstruction(e.target.value)}
              placeholder={format === "xlsx" ? "e.g. Create a monthly budget tracker with categories and totals" : format === "csv" ? "e.g. Turn this campaign plan into a table" : "e.g. Write a one-page summary of this conversation"} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="art-name">File name (optional)</Label>
            <Input id="art-name" maxLength={120} value={filename} onChange={(e) => setFilename(e.target.value)} placeholder="Uses the document title if empty" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!valid}>Create {format.toUpperCase()}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GeneratedFileCard({ a, job, canRegenerate, onRegenerate, onDeleted, onAttach }: {
  a: AttachmentRow; job: ArtifactJobRow | undefined; canRegenerate: boolean;
  onRegenerate: (j: ArtifactJobRow) => void; onDeleted: () => void; onAttach: (row: AttachmentRow) => void;
}) {
  const getUrl = useAttachmentUrl();
  const delFn = useServerFn(deleteAttachment);
  const reuseFn = useServerFn(reuseArtifactAttachment);
  const ext = a.original_filename.split(".").pop()?.toUpperCase() ?? "FILE";
  const sheet = ext === "XLSX" || ext === "CSV";
  const download = async () => {
    try { const url = await getUrl(a.id, true); const el = document.createElement("a"); el.href = url; el.rel = "noopener"; el.click(); }
    catch (e) { notify.fromError(e); }
  };
  const attach = async () => {
    if (!a.chat_id) return;
    try { const row = await reuseFn({ data: { attachmentId: a.id, chatId: a.chat_id } }); onAttach({ ...a, ...row, message_id: null, attachment_type: "upload" }); notify.success("File added to your next message"); }
    catch (e) { notify.fromError(e); }
  };
  const s = job?.summary;
  return (
    <div className="w-full rounded-lg border bg-card p-3 text-sm text-card-foreground">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-md bg-muted">{sheet ? <FileSpreadsheet className="size-5" /> : <FileText className="size-5" />}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium" title={a.original_filename}>{a.original_filename}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{ext}</Badge>
            <span>{formatBytes(a.size_bytes)}</span><span>·</span><span>Generated</span>
          </div>
        </div>
      </div>
      {s?.sheets && (
        <ul className="mt-2 space-y-1 rounded-md bg-muted/50 p-2 text-xs">
          {s.sheets.map((sh) => (
            <li key={sh.name} className="min-w-0">
              <span className="font-medium">{sh.name}</span> <span className="text-muted-foreground">· {sh.rowCount} rows · {sh.columns.length} columns</span>
              <div className="truncate text-muted-foreground">{sh.columns.join(", ")}</div>
            </li>
          ))}
        </ul>
      )}
      {!s?.sheets && s?.title && <p className="mt-2 truncate text-xs text-muted-foreground">“{s.title}”{s.sections ? ` · ${s.sections} sections` : ""}</p>}
      <div className="mt-2 flex flex-wrap gap-1">
        <Button size="sm" variant="secondary" onClick={() => void download()}><Download className="size-3.5" />Download</Button>
        {job && <Button size="sm" variant="ghost" disabled={!canRegenerate} onClick={() => onRegenerate(job)}><RefreshCw className="size-3.5" />Regenerate</Button>}
        <Button size="sm" variant="ghost" onClick={() => void attach()}><Paperclip className="size-3.5" />Attach to message</Button>
        <ConfirmDialog title="Delete this file?" description="The generated file will be permanently deleted." confirmLabel="Delete" destructive
          onConfirm={async () => { try { await delFn({ data: { id: a.id } }); notify.success("File deleted"); onDeleted(); } catch (e) { notify.fromError(e); } }}
          trigger={<Button size="sm" variant="ghost" className="text-muted-foreground"><Trash2 className="size-3.5" />Delete</Button>} />
      </div>
    </div>
  );
}
