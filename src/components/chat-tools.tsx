import { useEffect, useState } from "react";
import { AlertCircle, FileSearch, FileSpreadsheet, FileText, ImageIcon, Loader2, Paperclip, RotateCcw, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AnalysisStatus } from "@/components/attachments";
import { formatBytes, isAnalyzable, isVisionImage, type AttachmentRow } from "@/lib/attachments";
import type { MessageCitations } from "@/lib/chats";
import type { ArtifactFormat } from "@/components/artifact-generation";
import { cn } from "@/lib/utils";

export function ToolsMenu({ disabled, running, onUpload, onAnalyze, onImage, onFile }: {
  disabled: boolean; running: { image: boolean; file: boolean };
  onUpload: () => void; onAnalyze: () => void; onImage: () => void; onFile: (f: ArtifactFormat) => void;
}) {
  const busy = running.image || running.file;
  const files: { f: ArtifactFormat; label: string; icon: typeof FileText }[] = [
    { f: "csv", label: "Create CSV", icon: FileSpreadsheet }, { f: "xlsx", label: "Create XLSX", icon: FileSpreadsheet },
    { f: "docx", label: "Create DOCX", icon: FileText }, { f: "pdf", label: "Create PDF", icon: FileText },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="icon" variant="ghost" className="relative shrink-0" aria-label={busy ? "Tools (a tool is running)" : "Tools"} title="Tools">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Wrench className="size-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-60">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Tools</DropdownMenuLabel>
        <DropdownMenuItem className="min-h-10" disabled={disabled} onSelect={onUpload}><Paperclip />Upload file</DropdownMenuItem>
        <DropdownMenuItem className="min-h-10" disabled={disabled} onSelect={onAnalyze}><FileSearch />Analyze selected attachment</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-10" disabled={running.image} onSelect={onImage}>
          {running.image ? <Loader2 className="animate-spin" /> : <ImageIcon />}Generate image
          {running.image && <span className="ml-auto text-xs text-muted-foreground">Running</span>}
        </DropdownMenuItem>
        {files.map(({ f, label, icon: Icon }) => (
          <DropdownMenuItem key={f} className="min-h-10" disabled={running.file || disabled} onSelect={() => onFile(f)}>
            <Icon />{label}<span className="ml-auto font-mono text-[10px] text-muted-foreground">/{f}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Choose earlier attachments in this chat to include for AI analysis on the next message. */
export function AnalyzePicker({ open, onOpenChange, attachments, selected, vision, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; attachments: AttachmentRow[] | undefined;
  selected: string[]; vision: boolean; onConfirm: (rows: AttachmentRow[]) => void;
}) {
  const [pick, setPick] = useState<Set<string>>(new Set());
  useEffect(() => { if (open) setPick(new Set(selected)); }, [open, selected]);
  const items = (attachments ?? []).filter((a) => a.attachment_type !== "generated_image" || vision);
  const selectable = (a: AttachmentRow) => isVisionImage(a.mime_type) ? vision
    : a.extraction?.extraction_status === "complete" || (isAnalyzable(a.original_filename) && !a.extraction);
  const toggle = (id: string) => setPick((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else if (n.size < 10) n.add(id); return n; });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSearch className="size-5" />Analyze attachments</DialogTitle>
          <DialogDescription>Choose files from this chat to include with your next message (up to 10). Only files the app could read are available.</DialogDescription>
        </DialogHeader>
        {!items.length ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No files in this chat yet. Use Tools → Upload file first.</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((a) => {
              const ok = selectable(a);
              return (
                <li key={a.id}>
                  <label className={cn("flex min-h-12 cursor-pointer items-start gap-3 rounded-md border p-2.5 text-sm", !ok && "cursor-not-allowed opacity-60", pick.has(a.id) && "border-primary/60 bg-primary/5")}>
                    <Checkbox checked={pick.has(a.id)} disabled={!ok} onCheckedChange={() => toggle(a.id)} className="mt-0.5" aria-label={`Include ${a.original_filename}`} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{a.original_filename}</div>
                      <div className="text-xs text-muted-foreground">{formatBytes(a.size_bytes)}</div>
                      {isVisionImage(a.mime_type) && !vision ? <p className="mt-1 text-[11px] text-muted-foreground">The selected model can't see images.</p> : <AnalysisStatus a={a} />}
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!pick.size && !selected.length} onClick={() => { onConfirm(items.filter((a) => pick.has(a.id))); onOpenChange(false); }}>
            Use {pick.size || ""} file{pick.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ContextChips({ rows, onRemove }: { rows: AttachmentRow[]; onRemove: (id: string) => void }) {
  if (!rows.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5 px-1 pb-2" aria-label="Files included for AI">
      {rows.map((a) => (
        <li key={a.id} className="flex max-w-full items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-xs sm:max-w-64">
          <FileSearch className="size-3.5 shrink-0 text-primary" />
          <span className="truncate" title={a.original_filename}>{a.original_filename}</span>
          <Button type="button" size="icon" variant="ghost" className="size-6" aria-label={`Stop including ${a.original_filename}`} onClick={() => onRemove(a.id)}><X className="size-3" /></Button>
        </li>
      ))}
    </ul>
  );
}

export function Citations({ c }: { c: MessageCitations }) {
  if (!c.sources?.length) return null;
  return (
    <div className="mt-2 w-full rounded-md border bg-muted/30 p-2 text-xs">
      <div className="mb-1 font-medium text-muted-foreground">Sources</div>
      <ul className="space-y-0.5">
        {c.sources.map((s, i) => (
          <li key={`${s.attachmentId}-${i}`} className="flex min-w-0 items-center gap-1.5">
            {s.label === "image" ? <ImageIcon className="size-3 shrink-0 text-muted-foreground" /> : <FileText className="size-3 shrink-0 text-muted-foreground" />}
            <span className="truncate"><span className="font-medium">{s.filename}</span>{s.label && s.label !== "image" ? ` — ${s.label}` : ""}</span>
          </li>
        ))}
      </ul>
      {c.truncated?.length > 0 && <p className="mt-1 text-muted-foreground">Only part of {c.truncated.join(", ")} was included because of length limits.</p>}
    </div>
  );
}

export function ToolFailureCard({ title, message, onRetry, onDismiss }: { title: string; message: string; onRetry: () => void; onDismiss: () => void }) {
  return (
    <div role="alert" className="flex w-full max-w-md items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{message}</div>
      </div>
      <Button size="sm" variant="secondary" onClick={onRetry}><RotateCcw className="size-3.5" />Retry</Button>
      <Button size="icon" variant="ghost" className="size-8" aria-label="Dismiss" onClick={onDismiss}><X className="size-4" /></Button>
    </div>
  );
}
