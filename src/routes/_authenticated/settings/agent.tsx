import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Copy, Loader2, Plus, Server, Square, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { agentKeys } from "@/components/agent-ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  createRunnerPairing, getAgentState, revokeRunner, setAgentPrefs, setDefaultWorkspace, setToolPermission, stopAllDevServers,
} from "@/lib/agent.functions";
import { TOOL_GROUPS, type PermissionMode, type ToolGroup } from "@/lib/agent-tools";
import { notify } from "@/lib/toast";

export const Route = createFileRoute("/_authenticated/settings/agent")({
  head: () => ({
    meta: [
      { title: "Agent Tools & Workspace — Unified AI Workspace" },
      { name: "description", content: "Connect your Agent Runner, pick a workspace and control what agent tools may do." },
      { property: "og:title", content: "Agent Tools & Workspace — Unified AI Workspace" },
      { property: "og:description", content: "Connect your Agent Runner, pick a workspace and control what agent tools may do." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgentSettingsPage,
});

const MODES: { v: PermissionMode; label: string }[] = [
  { v: "disabled", label: "Disabled" }, { v: "ask_every_time", label: "Ask every time" }, { v: "auto_allow", label: "Allow automatically" },
];

function AgentSettingsPage() {
  const qc = useQueryClient();
  const fetchState = useServerFn(getAgentState);
  const state = useQuery({ queryKey: agentKeys.state, queryFn: () => fetchState(), refetchInterval: 10_000 });
  const pair = useServerFn(createRunnerPairing);
  const revoke = useServerFn(revokeRunner);
  const setDefault = useServerFn(setDefaultWorkspace);
  const setPerm = useServerFn(setToolPermission);
  const setPrefs = useServerFn(setAgentPrefs);
  const stopAll = useServerFn(stopAllDevServers);
  const invalidate = () => void qc.invalidateQueries({ queryKey: agentKeys.state });
  const [name, setName] = useState("My computer");
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);

  const pairM = useMutation({ mutationFn: () => pair({ data: { name } }), onSuccess: (r) => { setCode(r); invalidate(); }, onError: (e) => notify.fromError(e) });
  const permM = useMutation({ mutationFn: (v: { group: ToolGroup; mode: PermissionMode }) => setPerm({ data: v }), onSuccess: invalidate, onError: (e) => notify.fromError(e) });
  const prefM = useMutation({ mutationFn: (v: { agentDefault?: boolean; autoContinue?: boolean }) => setPrefs({ data: v }), onSuccess: invalidate, onError: (e) => notify.fromError(e) });

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const s = state.data;
  return (
    <>
      <PageHeader title="Agent Tools & Workspace" description="Real tools run only on your own Agent Runner" />
      <div className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6">
        {state.isPending ? <Skeleton className="h-64 w-full" /> : state.isError ? <ErrorState message="Couldn't load agent settings." onRetry={() => void state.refetch()} /> : s && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Server className="size-5" />Agent Runner</CardTitle>
                <CardDescription>The runner is a small program you run on your computer or a private server. It does web search, page reading, file, terminal, git and dev-server work inside folders you approve. It connects out to this app, so nothing on your machine has to be opened to the internet.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {s.runners.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Runner not connected. Pair one below — Agent Mode tools stay unavailable until then.</p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {s.runners.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                        <span className={`size-2 rounded-full ${r.online ? "bg-success" : "bg-muted-foreground/40"}`} aria-hidden />
                        <span className="font-medium">{r.name}</span>
                        <Badge variant={r.online ? "default" : "secondary"}>{r.status === "pending" ? "Waiting for pairing" : r.online ? "Connected" : "Offline"}</Badge>
                        {r.platform && <span className="text-xs text-muted-foreground">{r.platform}{r.version ? ` · v${r.version}` : ""}</span>}
                        <span className="flex-1" />
                        <ConfirmDialog title="Remove this runner?" description="Its token stops working immediately and its workspaces are removed from this app." confirmLabel="Remove" destructive
                          onConfirm={async () => { await revoke({ data: { runnerId: r.id } }).catch((e) => notify.fromError(e)); invalidate(); }}
                          trigger={<Button size="icon" variant="ghost" aria-label="Remove runner"><Trash2 className="size-4" /></Button>} />
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1"><Label htmlFor="rn">Runner name</Label><Input id="rn" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className="w-56" /></div>
                  <Button onClick={() => pairM.mutate()} disabled={pairM.isPending || !name.trim()}>{pairM.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Pair a runner</Button>
                </div>
                {code && (
                  <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
                    <p>One-time pairing code (expires in 15 minutes, shown only once):</p>
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-background px-3 py-1.5 font-mono text-lg tracking-widest">{code.code}</code>
                      <Button size="icon" variant="ghost" aria-label="Copy code" onClick={() => void navigator.clipboard.writeText(code.code)}><Copy className="size-4" /></Button>
                    </div>
                    <p className="text-muted-foreground">On your machine, inside the <code>agent-runner</code> folder from the project, run:</p>
                    <pre className="overflow-x-auto rounded bg-background p-2 font-mono text-xs">{`APP_URL=${appUrl} python -m runner pair ${code.code}`}</pre>
                    <p className="text-muted-foreground">Then start it with <code>python -m runner start</code> (or Docker — see the runner README).</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Workspace</CardTitle><CardDescription>Only folders listed in the runner's APPROVED_WORKSPACE_ROOTS appear here. The app cannot add other paths.</CardDescription></CardHeader>
              <CardContent>
                {s.workspaces.length === 0 ? <p className="text-sm text-muted-foreground">No approved workspaces yet. They appear once a runner connects.</p> : (
                  <Select value={s.workspaces.find((w) => w.isDefault)?.id ?? ""} onValueChange={(v) => void setDefault({ data: { workspaceId: v } }).then(invalidate, (e) => notify.fromError(e))}>
                    <SelectTrigger className="w-full sm:w-96"><SelectValue placeholder="Choose the default workspace" /></SelectTrigger>
                    <SelectContent>{s.workspaces.map((w) => <SelectItem key={w.id} value={w.id}>{w.name} — {w.root}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="size-5" />Agent Mode</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <label className="flex items-center justify-between gap-4 text-sm"><span>Turn Agent Mode on by default in chats</span>
                  <Switch checked={s.agentDefault} onCheckedChange={(v) => prefM.mutate({ agentDefault: v })} /></label>
                <label className="flex items-center justify-between gap-4 text-sm"><span>Auto-continue when a reply is cut off</span>
                  <Switch checked={s.autoContinue} onCheckedChange={(v) => prefM.mutate({ autoContinue: v })} /></label>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Tool permissions</CardTitle><CardDescription>Deleting, moving, overwriting, installing packages, git changes and starting/stopping servers always ask, whatever you choose here.</CardDescription></CardHeader>
              <CardContent className="divide-y">
                {TOOL_GROUPS.map((g) => (
                  <div key={g.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div><div className="text-sm font-medium">{g.label}</div><div className="text-xs text-muted-foreground">{g.description}</div></div>
                    <Select value={s.permissions[g.id]} onValueChange={(v) => permM.mutate({ group: g.id, mode: v as PermissionMode })}>
                      <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>{MODES.map((m) => <SelectItem key={m.v} value={m.v}>{m.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Development servers</CardTitle><CardDescription>Reported by your runner. They stay on your machine and are never exposed publicly.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {s.devServers.length === 0 ? <p className="text-sm text-muted-foreground">No managed servers.</p> : (
                  <ul className="space-y-1 text-sm">{s.devServers.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-2"><Badge variant={d.status === "running" ? "default" : d.status === "failed" ? "destructive" : "secondary"}>{d.status[0]!.toUpperCase() + d.status.slice(1)}</Badge>
                      <code className="text-xs">{d.command}</code>{d.port && <span className="text-xs text-muted-foreground">port {d.port}</span>}</li>
                  ))}</ul>
                )}
                <Button variant="outline" onClick={() => void stopAll().then((r) => { notify.success(r.queued ? `Stopping ${r.queued} server(s)…` : "No running servers."); invalidate(); }, (e) => notify.fromError(e))}>
                  <Square className="size-4" />Stop all development servers
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
