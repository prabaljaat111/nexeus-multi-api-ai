import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, ChevronRight, Loader2, Play, RotateCcw, Square, X, FolderGit2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { cn } from "@/lib/utils";
import { parseCodeOutput } from "@/lib/code-shared";
import { runDisplayStatus, type ChangeSet, type CodeRun, type ProjectFile } from "@/lib/code-projects";
import type { ChangeItem } from "@/lib/code-projects.functions";
import { DiffView } from "./diff-view";

const SUGGESTIONS = [
  { label: "Plan this feature", text: "Plan this feature before writing code: " },
  { label: "Build UI", text: "Build a polished, responsive UI for " },
  { label: "Refactor selected file", text: "Refactor the selected file for readability without changing behavior." },
  { label: "Explain code", text: "Explain how the selected file works by adding clear comments to it." },
  { label: "Generate tests", text: "Add a small test file for the selected file's main logic." },
];

const STATUS_LABEL: Record<ReturnType<typeof runDisplayStatus>, string> = {
  streaming: "Streaming", interrupted: "Interrupted", length: "Maximum output reached", stopped: "Stopped", failed: "Failed", review: "Awaiting review", complete: "Completed",
};

export function CodingChat(props: {
  projectTitle: string; modelLabel: string | null; runs: CodeRun[]; sets: ChangeSet[]; files: ProjectFile[];
  live: { runId: string | null; text: string; active: boolean; continuation: number };
  selectedPath: string | null; autoApply: boolean; autoContinue: boolean;
  onAutoApply: (v: boolean) => void; onAutoContinue: (v: boolean) => void;
  prefill: string | null; onPrefillUsed: () => void;
  onSend: (text: string) => void; onStop: () => void; onContinue: (runId: string) => void; onReviewPartial: (runId: string) => void;
  onDecide: (setId: string, ids: string[], decision: "apply" | "reject") => Promise<void>; disabled: string | null;
}) {
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { if (props.prefill) { setText(props.prefill); props.onPrefillUsed(); } }, [props.prefill, props]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [props.runs.length, props.live.active]);

  const submit = () => { const t = text.trim(); if (!t || props.live.active || props.disabled) return; props.onSend(t); setText(""); };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2 text-xs">
        <Badge variant="secondary" className="gap-1"><FolderGit2 className="size-3" />{props.projectTitle}</Badge>
        <Badge variant="outline" className="max-w-[12rem] truncate">{props.modelLabel ?? "No model"}</Badge>
        {props.selectedPath && <Badge variant="outline" className="max-w-[10rem] truncate font-mono">{props.selectedPath}</Badge>}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {props.runs.length === 0 && !props.live.active && (
          <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            Describe what to build. The AI proposes a plan and file changes; nothing is applied until you review it.
          </div>
        )}
        {props.runs.map((r) => (
          <RunCard key={r.id} run={r} sets={props.sets.filter((s) => s.generation_run_id === r.id)} files={props.files}
            live={props.live.runId === r.id ? props.live : null} busy={props.live.active}
            onContinue={() => props.onContinue(r.id)} onReviewPartial={() => props.onReviewPartial(r.id)} onDecide={props.onDecide} />
        ))}
        {props.live.active && !props.runs.some((r) => r.id === props.live.runId) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Starting…</div>
        )}
      </div>
      <div className="space-y-2 border-t p-2">
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {SUGGESTIONS.map((s) => (
            <button key={s.label} type="button" onClick={() => setText(s.text)} className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground">{s.label}</button>
          ))}
        </div>
        <div className="rounded-lg border bg-background focus-within:ring-1 focus-within:ring-ring">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={16000}
            placeholder={props.disabled ?? "Ask the AI to build or change something…"} disabled={!!props.disabled}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            className="max-h-40 min-h-[3rem] resize-none border-0 text-sm shadow-none focus-visible:ring-0" aria-label="Coding request" />
          <div className="flex items-center gap-3 px-2 pb-2">
            <div className="flex items-center gap-1.5"><Switch id="auto-cont" checked={props.autoContinue} onCheckedChange={props.onAutoContinue} /><Label htmlFor="auto-cont" className="text-[11px] text-muted-foreground">Auto-continue</Label></div>
            <div className="flex items-center gap-1.5"><Switch id="auto-apply" checked={props.autoApply} onCheckedChange={props.onAutoApply} /><Label htmlFor="auto-apply" className="text-[11px] text-muted-foreground">Auto-apply</Label></div>
            <div className="ml-auto">
              {props.live.active
                ? <Button size="icon" variant="secondary" className="size-8" onClick={props.onStop} aria-label="Stop generation"><Square className="size-3.5" /></Button>
                : <Button size="icon" className="size-8" onClick={submit} disabled={!text.trim() || !!props.disabled} aria-label="Send"><ArrowUp className="size-4" /></Button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RunCard({ run, sets, files, live, busy, onContinue, onReviewPartial, onDecide }: {
  run: CodeRun; sets: ChangeSet[]; files: ProjectFile[]; live: { text: string; continuation: number } | null; busy: boolean;
  onContinue: () => void; onReviewPartial: () => void; onDecide: (setId: string, ids: string[], d: "apply" | "reject") => Promise<void>;
}) {
  const output = live ? parseCodeOutput(run.output ? parseCodeOutput(run.output).completeText + live.text : live.text) : parseCodeOutput(run.output);
  const status = live ? "streaming" : runDisplayStatus(run);
  const set = sets[0];
  const incomplete = status === "length" || status === "stopped" || status === "interrupted";
  return (
    <div className="space-y-2">
      <div className="ml-auto max-w-[90%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-wrap break-words">{run.instruction}</div>
      <div className="rounded-lg border bg-card p-3 text-xs">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Badge variant={status === "failed" ? "destructive" : status === "review" ? "default" : "secondary"} className="gap-1">
            {status === "streaming" && <Loader2 className="size-3 animate-spin" />}{STATUS_LABEL[status]}
          </Badge>
          {(live?.continuation ?? run.continuation_count) > 0 && <Badge variant="outline">Continuation {live?.continuation ?? run.continuation_count}</Badge>}
          {run.finish_reason && !live && <span className="text-muted-foreground">Finish: {run.finish_reason === "completed" ? "completed" : run.finish_reason === "length" ? "maximum output reached" : run.finish_reason}</span>}
        </div>
        {output.plan && <div className="mb-2 whitespace-pre-wrap text-muted-foreground">{output.plan}</div>}
        {!output.plan && status === "streaming" && <p className="text-muted-foreground">Planning…</p>}
        {(status === "streaming" || incomplete) && (
          <ul className="space-y-0.5">
            {output.ops.map((o) => <li key={o.path} className="flex items-center gap-1.5 font-mono"><Check className="size-3 text-success" />{o.path}</li>)}
            {output.partialPath && <li className="flex items-center gap-1.5 font-mono text-muted-foreground">{status === "streaming" ? <Loader2 className="size-3 animate-spin" /> : <AlertTriangle className="size-3" />}{output.partialPath}{status !== "streaming" && " (incomplete)"}</li>}
          </ul>
        )}
        {run.error_message && <p className="mt-2 text-destructive">{run.error_message}</p>}
        {status === "length" && <p className="mt-2 text-muted-foreground">The model hit its output limit. Continue picks up from the last incomplete file without repeating finished ones.</p>}
        {incomplete && !busy && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={onContinue}><Play className="size-3" />Continue</Button>
            {output.ops.length > 0 && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onReviewPartial}>Review {output.ops.length} completed file{output.ops.length === 1 ? "" : "s"}</Button>}
          </div>
        )}
        {set && <ChangeSetReview set={set} files={files} onDecide={onDecide} />}
      </div>
    </div>
  );
}

function ChangeSetReview({ set, files, onDecide }: { set: ChangeSet; files: ProjectFile[]; onDecide: (setId: string, ids: string[], d: "apply" | "reject") => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const pending = set.changes.filter((c) => c.status === "pending");
  const fileMap = useMemo(() => new Map(files.map((f) => [f.path, f.content])), [files]);
  const act = async (ids: string[], d: "apply" | "reject") => { setBusy(true); try { await onDecide(set.id, ids, d); } finally { setBusy(false); } };
  const hasDelete = pending.some((c) => c.action === "delete");
  return (
    <div className="mt-3 space-y-1.5 border-t pt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{set.changes.length} file change{set.changes.length === 1 ? "" : "s"}</span>
        <Badge variant="outline" className="text-[10px]">{set.status.replace("_", " ")}</Badge>
        {pending.length > 0 && (
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => void act(pending.map((c) => c.id), "reject")}><X className="size-3" />Reject all</Button>
            {hasDelete
              ? <ConfirmDialog destructive title="Apply all changes?" description="This includes deleting files. Deleted files and their history can't be recovered." confirmLabel="Apply all"
                  trigger={<Button size="sm" className="h-7 text-xs" disabled={busy}><Check className="size-3" />Apply all</Button>} onConfirm={() => act(pending.map((c) => c.id), "apply")} />
              : <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={() => void act(pending.map((c) => c.id), "apply")}><Check className="size-3" />Apply all</Button>}
          </div>
        )}
      </div>
      {set.changes.map((c) => <ChangeRow key={c.id} c={c} before={fileMap.get(c.path) ?? ""} exists={fileMap.has(c.path)} open={open === c.id} busy={busy}
        onToggle={() => setOpen((o) => (o === c.id ? null : c.id))} onAct={(d) => void act([c.id], d)} />)}
    </div>
  );
}

function ChangeRow({ c, before, exists, open, busy, onToggle, onAct }: { c: ChangeItem; before: string; exists: boolean; open: boolean; busy: boolean; onToggle: () => void; onAct: (d: "apply" | "reject") => void }) {
  const label = c.action === "delete" ? "delete" : exists ? "update" : "create";
  return (
    <div className="rounded-md border">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" aria-expanded={open}>
          {open ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
          <span className={cn("rounded px-1 text-[10px] uppercase", label === "delete" ? "bg-destructive/15 text-destructive" : label === "create" ? "bg-success/15 text-success" : "bg-muted")}>{label}</span>
          <span className="truncate font-mono">{c.path}</span>
        </button>
        {c.status === "pending" ? (
          <div className="flex shrink-0 gap-0.5">
            <Button size="icon" variant="ghost" className="size-6" disabled={busy} aria-label={`Reject ${c.path}`} onClick={() => onAct("reject")}><X className="size-3" /></Button>
            {c.action === "delete"
              ? <ConfirmDialog destructive title={`Delete ${c.path}?`} description="The file and its version history will be removed." confirmLabel="Delete"
                  trigger={<Button size="icon" variant="ghost" className="size-6" disabled={busy} aria-label={`Apply ${c.path}`}><Check className="size-3" /></Button>} onConfirm={() => onAct("apply")} />
              : <Button size="icon" variant="ghost" className="size-6" disabled={busy} aria-label={`Apply ${c.path}`} onClick={() => onAct("apply")}><Check className="size-3" /></Button>}
          </div>
        ) : <span className={cn("shrink-0 text-[10px]", c.status === "applied" ? "text-success" : "text-muted-foreground")}>{c.status === "applied" ? "Applied" : "Rejected"}</span>}
      </div>
      {(c.summary || c.error) && <p className="px-2 pb-1.5 text-muted-foreground">{c.summary}{c.error && <span className="block text-destructive">{c.error}</span>}</p>}
      {open && c.action !== "delete" && <DiffView before={exists ? before : ""} after={c.content ?? ""} className="m-2 mt-0" />}
      {open && c.action === "delete" && <p className="px-2 pb-2 text-destructive"><RotateCcw className="mr-1 inline size-3" />This file will be removed.</p>}
    </div>
  );
}
