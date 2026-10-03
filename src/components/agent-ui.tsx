import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Bot, CheckCircle2, ChevronDown, Clock, ExternalLink, Globe, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveApproval } from "@/lib/agent.functions";
import { summarize, TOOL_META, type AgentStepEvent, type Risk, type ToolName } from "@/lib/agent-tools";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";

export const agentKeys = { steps: (chatId: string) => ["agentSteps", chatId] as const, state: ["agentState"] as const };

/** Persisted tool steps for a chat, grouped by assistant message (survives refresh/disconnect). */
export function useAgentSteps(chatId: string) {
  const q = useQuery({
    queryKey: agentKeys.steps(chatId),
    queryFn: async () => {
      const { data: runs, error } = await supabase.from("agent_runs").select("id, message_id, status, error_message").eq("chat_id", chatId).order("created_at");
      if (error) throw error;
      const ids = (runs ?? []).map((r) => r.id);
      if (!ids.length) return new Map<string, AgentStepEvent[]>();
      const { data: steps } = await supabase.from("agent_tool_steps").select("id, agent_run_id, step_number, tool_name, safe_input, safe_output, status, duration_ms").in("agent_run_id", ids).order("step_number");
      const byRun = new Map(runs!.map((r) => [r.id, r.message_id]));
      const map = new Map<string, AgentStepEvent[]>();
      for (const s of steps ?? []) {
        const mid = byRun.get(s.agent_run_id);
        if (!mid) continue;
        const input = (s.safe_input && typeof s.safe_input === "object" ? s.safe_input : {}) as Record<string, unknown>;
        const meta = TOOL_META[s.tool_name as ToolName];
        map.set(mid, [...(map.get(mid) ?? []), {
          id: s.id, step: s.step_number, tool: s.tool_name, summary: summarize(s.tool_name, input), risk: meta?.risk ?? "medium",
          status: s.status as AgentStepEvent["status"], durationMs: s.duration_ms, output: s.safe_output,
        }]);
      }
      return map;
    },
  });
  return q;
}

const RISK: Record<Risk, string> = { low: "Low risk", medium: "Medium risk", high: "High risk" };

function StatusIcon({ s }: { s: AgentStepEvent["status"] }) {
  if (s === "running" || s === "requested") return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />;
  if (s === "awaiting_approval") return <ShieldAlert className="size-3.5 text-primary" />;
  if (s === "complete") return <CheckCircle2 className="size-3.5 text-success" />;
  return <XCircle className="size-3.5 text-destructive" />;
}
const STATUS_LABEL: Record<AgentStepEvent["status"], string> = {
  requested: "Queued", awaiting_approval: "Waiting for permission", running: "Running", complete: "Done", failed: "Failed", denied: "Not run",
};

export function ToolSteps({ steps }: { steps: AgentStepEvent[] }) {
  if (!steps.length) return null;
  return <div className="mb-2 flex w-full flex-col gap-1.5">{steps.map((s) => <ToolStepCard key={s.id} s={s} />)}</div>;
}

function ToolStepCard({ s }: { s: AgentStepEvent }) {
  const [open, setOpen] = useState(false);
  const out = s.output === undefined || s.output === null ? null : JSON.stringify(s.output, null, 2);
  return (
    <div className="rounded-md border bg-muted/30 text-xs">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full min-w-0 items-center gap-2 px-2.5 py-1.5 text-left" aria-expanded={open}>
        <StatusIcon s={s.status} />
        <span className="min-w-0 flex-1 truncate"><span className="font-medium">{s.summary}</span></span>
        <span className="hidden shrink-0 text-muted-foreground sm:inline">{STATUS_LABEL[s.status]}</span>
        {s.durationMs != null && <span className="flex shrink-0 items-center gap-0.5 text-muted-foreground"><Clock className="size-3" />{(s.durationMs / 1000).toFixed(1)}s</span>}
        {out && <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} />}
      </button>
      {open && out && (
        <div className="border-t px-2.5 py-2">
          <div className="mb-1 flex items-center gap-2 text-muted-foreground"><code>{s.tool}</code><span>· {RISK[s.risk]}</span></div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-background p-2 font-mono text-[11px]">{out.slice(0, 6000)}</pre>
        </div>
      )}
    </div>
  );
}

/** Opens automatically for the step currently waiting for permission. */
export function ApprovalDialog({ step }: { step: AgentStepEvent | null }) {
  const resolve = useServerFn(resolveApproval);
  const [always, setAlways] = useState(false);
  const [busy, setBusy] = useState(false);
  const [handled, setHandled] = useState<string | null>(null);
  const open = !!step?.approvalId && handled !== step.approvalId;
  const meta = step ? TOOL_META[step.tool as ToolName] : undefined;
  const canAlways = !!meta && meta.risk !== "high" && !meta.alwaysConfirm;
  async function act(decision: "approved" | "denied") {
    if (!step?.approvalId) return;
    setBusy(true);
    try {
      await resolve({ data: { approvalId: step.approvalId, decision, alwaysAllow: decision === "approved" && canAlways && always } });
      setHandled(step.approvalId);
      setAlways(false);
    } catch (e) { notify.fromError(e); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && step?.approvalId) void act("denied"); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldAlert className="size-5 text-primary" />Allow this action?</DialogTitle>
          <DialogDescription>The agent wants to use a tool on your connected runner. Nothing runs until you allow it.</DialogDescription>
        </DialogHeader>
        {step && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Tool</dt><dd><code>{step.tool}</code></dd>
            <dt className="text-muted-foreground">Action</dt><dd className="break-words">{step.summary}</dd>
            {step.workspace && <><dt className="text-muted-foreground">Workspace</dt><dd>{step.workspace}</dd></>}
            <dt className="text-muted-foreground">Risk</dt>
            <dd><Badge variant={step.risk === "high" ? "destructive" : "secondary"}>{RISK[step.risk]}</Badge></dd>
          </dl>
        )}
        {canAlways && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={always} onCheckedChange={(v) => setAlways(v === true)} />Always allow this kind of action in this workspace
          </label>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => void act("denied")}>Deny</Button>
          <Button disabled={busy} onClick={() => void act("approved")}>{busy && <Loader2 className="size-4 animate-spin" />}Allow once</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WebSources({ citations }: { citations: unknown }) {
  const web = useMemo(() => {
    if (!citations || typeof citations !== "object" || !("web" in citations)) return [];
    const w = (citations as { web: unknown }).web;
    return Array.isArray(w) ? w.filter((x): x is { title: string; url: string } => !!x && typeof x === "object" && typeof (x as { url?: unknown }).url === "string" && /^https?:\/\//.test((x as { url: string }).url)) : [];
  }, [citations]);
  if (!web.length) return null;
  return (
    <div className="mt-2 w-full rounded-md border bg-muted/30 p-2 text-xs">
      <div className="mb-1 flex items-center gap-1 font-medium text-muted-foreground"><Globe className="size-3" />Sources</div>
      <ol className="space-y-0.5">
        {web.map((s, i) => (
          <li key={`${s.url}-${i}`} className="min-w-0">
            <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 text-primary hover:underline">
              <span className="truncate">{i + 1}. {s.title || s.url}</span><ExternalLink className="size-3 shrink-0" />
            </a>
            <div className="truncate text-muted-foreground">{s.url}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AgentToggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Button type="button" size="sm" variant={on ? "default" : "ghost"} className="h-9 shrink-0 gap-1 px-2 text-xs" disabled={disabled}
      aria-pressed={on} aria-label="Agent Mode" title={on ? "Agent Mode on — the model can use tools" : "Agent Mode off"} onClick={() => onChange(!on)}>
      <Bot className="size-4" /><span className="hidden sm:inline">Agent</span>
    </Button>
  );
}

export function RunnerBanner({ message }: { message: string }) {
  return (
    <div role="status" className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
      <Bot className="size-4 shrink-0" /><span className="min-w-0 flex-1">{message}</span>
      <Button asChild size="sm" variant="outline" className="h-7 text-xs"><Link to="/settings/agent">Agent settings</Link></Button>
    </div>
  );
}
