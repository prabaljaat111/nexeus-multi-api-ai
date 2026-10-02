import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft, Download, FilePlus2, History, MoreVertical, PanelLeft, PanelRight, Play, Redo2, Save, Send, Trash2, Undo2, FileText, Pencil, Code2,
} from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ErrorState, LoadingState, EmptyState } from "@/components/states";
import { FileTree } from "@/components/code/file-tree";
import { CodingChat } from "@/components/code/coding-chat";
import { PreviewPane, type ConsoleEntry } from "@/components/code/preview-pane";
import { DiffView } from "@/components/code/diff-view";
import type { EditorHandle } from "@/components/code/code-editor";
import { useIsMobile } from "@/hooks/use-mobile";
import { chatKeys, listSelectableModels } from "@/lib/chats";
import {
  codeKeys, downloadBlob, downloadText, getProject, listFiles, listRuns, listVersions, useCodeStream, type ProjectFile,
} from "@/lib/code-projects";
import {
  applyCodeChanges, deleteCodeProject, deleteProjectFile, exportCodeProject, finalizeCodeRun, renameProjectFile,
  restoreProjectFileVersion, saveProjectFile, updateCodeProject,
} from "@/lib/code-projects.functions";
import { buildProjectReadme, normalizeProjectPath, redactSecrets } from "@/lib/code-shared";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";

const CodeEditor = lazy(() => import("@/components/code/code-editor"));

export const Route = createFileRoute("/_authenticated/build/$projectId")({
  head: () => ({
    meta: [
      { title: "Project — Build — Unified AI Workspace" },
      { name: "description", content: "Edit, preview, review AI changes and export your project." },
      { property: "og:title", content: "Project — Build — Unified AI Workspace" },
      { property: "og:description", content: "Edit, preview, review AI changes and export your project." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Workspace,
});

type CenterTab = "preview" | "code" | "diff" | "console";
type MobileTab = "chat" | "files" | "preview" | "code";

function usePref(key: string, def: boolean): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(def);
  useEffect(() => { const s = localStorage.getItem(key); if (s !== null) setV(s === "1"); }, [key]);
  return [v, (n: boolean) => { setV(n); localStorage.setItem(key, n ? "1" : "0"); }];
}

function Workspace() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const project = useQuery({ queryKey: codeKeys.project(projectId), queryFn: () => getProject(projectId) });
  const files = useQuery({ queryKey: codeKeys.files(projectId), queryFn: () => listFiles(projectId), staleTime: 0 });
  const runs = useQuery({ queryKey: codeKeys.runs(projectId), queryFn: () => listRuns(projectId), staleTime: 0 });
  const models = useQuery({ queryKey: chatKeys.selectableModels, queryFn: listSelectableModels });

  const [selected, setSelected] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<CenterTab>("preview");
  const [mTab, setMTab] = useState<MobileTab>("chat");
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [buildKey, setBuildKey] = useState(0);
  const [logs, setLogs] = useState<ConsoleEntry[]>([]);
  const [prefill, setPrefill] = useState<string | null>(null);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [renaming, setRenaming] = useState<ProjectFile | null>(null);
  const [deleting, setDeleting] = useState<ProjectFile | null>(null);
  const [autoApply, setAutoApply] = usePref("uaw-code-autoapply", false);
  const [autoContinue, setAutoContinue] = usePref("uaw-code-autocontinue", true);
  const editorRef = useRef<EditorHandle>(null);

  const fns = {
    save: useServerFn(saveProjectFile), rename: useServerFn(renameProjectFile), del: useServerFn(deleteProjectFile),
    apply: useServerFn(applyCodeChanges), finalize: useServerFn(finalizeCodeRun), restore: useServerFn(restoreProjectFileVersion),
    exportZip: useServerFn(exportCodeProject), update: useServerFn(updateCodeProject), delProject: useServerFn(deleteCodeProject),
  };
  const stream = useCodeStream();

  const fileList = useMemo(() => files.data ?? [], [files.data]);
  useEffect(() => {
    if (!selected && fileList.length) setSelected((fileList.find((f) => /src\/App\.\w+$/.test(f.path)) ?? fileList.find((f) => f.is_entry_file) ?? fileList[0]!).path);
  }, [fileList, selected]);
  const current = fileList.find((f) => f.path === selected) ?? null;
  const dirty = useMemo(() => new Set(Object.entries(drafts).filter(([p, c]) => fileList.find((f) => f.path === p)?.content !== c).map(([p]) => p)), [drafts, fileList]);

  const refresh = useCallback(async (rebuild = true) => {
    await Promise.all([qc.invalidateQueries({ queryKey: codeKeys.files(projectId) }), qc.invalidateQueries({ queryKey: codeKeys.runs(projectId) })]);
    if (rebuild) { setLogs([]); setBuildKey((k) => k + 1); }
  }, [qc, projectId]);

  const model = models.data?.find((m) => m.id === project.data?.selected_model_id) ?? null;
  const onConsole = useCallback((e: ConsoleEntry) => setLogs((l) => [...l.slice(-199), e]), []);

  const decide = useCallback(async (setId: string, ids: string[], decision: "apply" | "reject") => {
    try {
      const r = await fns.apply({ data: { projectId, changeSetId: setId, changeIds: ids, decision } });
      if (r.errors.length) notify.error("Some changes weren't applied", r.errors.slice(0, 3).join("\n"));
      else notify.success(decision === "apply" ? "Changes applied" : "Changes rejected");
      setDrafts((d) => { const n = { ...d }; return n; });
      await refresh(decision === "apply");
    } catch (e) { notify.fromError(e); }
  }, [fns, projectId, refresh]);

  const runGeneration = useCallback(async (body: { instruction?: string; continueRunId?: string }, depth = 0): Promise<void> => {
    if (!model) { notify.error("Choose a model for this project first."); return; }
    const p = stream.start({ projectId, modelId: model.id, selectedPath: selected, ...body });
    setTimeout(() => void qc.invalidateQueries({ queryKey: codeKeys.runs(projectId) }), 800);
    const r = await p;
    await qc.invalidateQueries({ queryKey: codeKeys.runs(projectId) });
    if (r.error) { notify.error(r.error); return; }
    if (r.finish === "length" && autoContinue && depth < 2 && r.runId) {
      notify.info(`Output limit reached — continuing automatically (${depth + 1}/2)`);
      return runGeneration({ continueRunId: r.runId }, depth + 1);
    }
    if (r.finish === "length") notify.info("The model reached its output limit. Use Continue to finish the remaining files.");
    if (r.finish === "completed" && autoApply && r.runId) {
      const data = await qc.fetchQuery({ queryKey: codeKeys.runs(projectId), queryFn: () => listRuns(projectId) });
      const set = data.sets.find((s) => s.generation_run_id === r.runId && s.status === "pending");
      const safe = set?.changes.filter((c) => c.status === "pending" && c.action !== "delete").map((c) => c.id) ?? [];
      if (set && safe.length) await decide(set.id, safe, "apply");
    }
  }, [model, stream, projectId, selected, qc, autoContinue, autoApply, decide]);

  const saveCurrent = useCallback(async () => {
    if (!current || !dirty.has(current.path)) return;
    try {
      await fns.save({ data: { projectId, path: current.path, content: drafts[current.path]! } });
      setDrafts((d) => { const n = { ...d }; delete n[current.path]; return n; });
      notify.success("Saved");
      await refresh();
    } catch (e) { notify.fromError(e); }
  }, [current, dirty, drafts, fns, projectId, refresh]);

  const exportZip = useMutation({
    mutationFn: () => fns.exportZip({ data: { projectId } }),
    onSuccess: (r) => {
      const bin = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      downloadBlob(r.filename, new Blob([bin], { type: "application/zip" }));
      if (r.skipped) notify.info(`${r.skipped} file(s) were left out because they looked unsafe.`);
    },
    onError: (e) => notify.fromError(e),
  });

  const sendErrorToAI = () => {
    const errs = logs.filter((l) => l.level === "error").slice(-5).map((l) => redactSecrets(l.text).slice(0, 600));
    if (!errs.length) return;
    setPrefill(`Fix this preview error${selected ? ` (current file: ${selected})` : ""}:\n${errs.join("\n")}`);
    if (isMobile) setMTab("chat"); else setShowRight(true);
  };

  if (project.isPending) return <LoadingState className="h-svh" label="Opening project…" />;
  if (project.isError) return <ErrorState className="h-svh" message={project.error.message} onRetry={() => void project.refetch()} />;
  if (!project.data) return <EmptyState className="h-svh" title="Project not found" description="It may have been deleted." action={<Button asChild><Link to="/build">Back to projects</Link></Button>} />;
  const p = project.data;

  const fileTree = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Files</span>
        <Button size="icon" variant="ghost" className="size-7" aria-label="New file" onClick={() => setNewFileOpen(true)}><FilePlus2 className="size-3.5" /></Button>
      </div>
      {files.isPending ? <LoadingState /> : files.isError ? <ErrorState message={files.error.message} onRetry={() => void files.refetch()} /> : (
        <FileTree files={fileList} selected={selected} dirty={dirty}
          onSelect={(path) => { setSelected(path); if (isMobile) setMTab("code"); else if (tab === "preview" || tab === "console") setTab("code"); }}
          onRename={setRenaming} onDelete={setDeleting} onDownload={(f) => downloadText(f.path.split("/").pop()!, f.content)} />
      )}
    </div>
  );

  const editor = current ? (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs">
        <span className="truncate font-mono">{current.path}</span>
        {dirty.has(current.path) && <Badge variant="outline" className="h-5 text-[10px]">Unsaved</Badge>}
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" className="size-7" aria-label="Copy file" onClick={() => void navigator.clipboard.writeText(drafts[current.path] ?? current.content).then(() => notify.success("Copied"))}><FileText className="size-3.5" /></Button>
          <Button size="sm" variant={dirty.has(current.path) ? "default" : "ghost"} className="h-7 text-xs" disabled={!dirty.has(current.path)} onClick={() => void saveCurrent()}><Save className="size-3.5" />Save</Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <Suspense fallback={<LoadingState label="Loading editor…" />}>
          <CodeEditor ref={editorRef} path={current.path} value={drafts[current.path] ?? current.content}
            onChange={(v) => setDrafts((d) => ({ ...d, [current.path]: v }))} onSave={() => void saveCurrent()} />
        </Suspense>
      </div>
    </div>
  ) : <EmptyState title="No file selected" description="Pick a file from the tree." />;

  const preview = (
    <PreviewPane framework={p.framework} files={fileList} buildKey={buildKey + files.dataUpdatedAt} onConsole={onConsole}
      fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen((f) => !f)} />
  );

  const consoleView = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs">
        <span className="text-muted-foreground">{logs.length} message{logs.length === 1 ? "" : "s"} from the preview</span>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setLogs([])}>Clear</Button>
          <Button size="sm" variant="secondary" className="h-7 text-xs" disabled={!logs.some((l) => l.level === "error")} onClick={sendErrorToAI}><Send className="size-3" />Send error to AI</Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2 font-mono text-[12px]">
        {logs.length === 0 ? <p className="p-2 text-muted-foreground">Console output and errors from the preview appear here.</p> :
          logs.map((l, i) => <div key={i} className={cn("whitespace-pre-wrap border-b border-border/50 px-1 py-0.5", l.level === "error" && "text-destructive", l.level === "warn" && "text-muted-foreground")}>{l.text}</div>)}
      </div>
    </div>
  );

  const center = (
    <div className="flex h-full min-h-0 flex-col">
      {!isMobile && (
        <div className="flex items-center border-b px-2 py-1">
          <Tabs value={tab} onValueChange={(v) => setTab(v as CenterTab)}>
            <TabsList className="h-8">
              <TabsTrigger value="preview" className="text-xs">Preview</TabsTrigger>
              <TabsTrigger value="code" className="text-xs">Code</TabsTrigger>
              <TabsTrigger value="diff" className="text-xs">Diff</TabsTrigger>
              <TabsTrigger value="console" className="text-xs">Console{logs.some((l) => l.level === "error") && <span className="ml-1 size-1.5 rounded-full bg-destructive" />}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {tab === "preview" && preview}
        {tab === "code" && editor}
        {tab === "diff" && <VersionHistory file={current} draft={current ? drafts[current.path] : undefined} onRestore={async (id) => {
          try { await fns.restore({ data: { projectId, versionId: id } }); notify.success("Version restored"); await refresh(); } catch (e) { notify.fromError(e); }
        }} />}
        {tab === "console" && consoleView}
      </div>
    </div>
  );

  const chat = (
    <CodingChat projectTitle={p.title} modelLabel={model ? `${model.display_name} · ${model.connection_name}` : null}
      runs={runs.data?.runs ?? []} sets={runs.data?.sets ?? []} files={fileList} live={stream.state} selectedPath={selected}
      autoApply={autoApply} autoContinue={autoContinue} onAutoApply={setAutoApply} onAutoContinue={setAutoContinue}
      prefill={prefill} onPrefillUsed={() => setPrefill(null)}
      disabled={!model ? "Choose a model in the toolbar to start" : null}
      onSend={(t) => void runGeneration({ instruction: t })} onStop={stream.stop}
      onContinue={(id) => void runGeneration({ continueRunId: id })}
      onReviewPartial={(id) => void fns.finalize({ data: { projectId, runId: id } }).then(() => refresh(false)).catch((e: unknown) => notify.fromError(e))}
      onDecide={decide} />
  );

  const toolbar = (
    <header className="flex min-h-12 shrink-0 items-center gap-1.5 border-b bg-background/90 px-2 backdrop-blur-sm">
      <SidebarTrigger />
      <Button asChild size="icon" variant="ghost" className="size-8" aria-label="All projects"><Link to="/build"><ChevronLeft className="size-4" /></Link></Button>
      <Code2 className="hidden size-4 text-muted-foreground sm:block" />
      <h1 className="min-w-0 max-w-[30vw] truncate text-sm font-semibold">{p.title}</h1>
      <Badge variant="outline" className="hidden text-[10px] md:inline-flex">{p.framework === "react_vite" ? "React + Vite" : "Static HTML"}</Badge>
      <div className="ml-auto flex items-center gap-1">
        <Select value={p.selected_model_id ?? ""} onValueChange={(v) => void fns.update({ data: { projectId, modelId: v } }).then(() => qc.invalidateQueries({ queryKey: codeKeys.project(projectId) })).catch((e: unknown) => notify.fromError(e))}>
          <SelectTrigger className="h-8 w-[9rem] text-xs sm:w-[13rem]" aria-label="AI model"><SelectValue placeholder="Choose model" /></SelectTrigger>
          <SelectContent>
            {[...new Set((models.data ?? []).map((m) => m.connection_name))].map((cn2) => (
              <SelectGroup key={cn2}><SelectLabel>{cn2}</SelectLabel>
                {(models.data ?? []).filter((m) => m.connection_name === cn2).map((m) => <SelectItem key={m.id} value={m.id} className="text-xs">{m.display_name}</SelectItem>)}
              </SelectGroup>
            ))}
            {models.data?.length === 0 && <div className="p-2 text-xs text-muted-foreground">No models. Add a connection in Settings.</div>}
          </SelectContent>
        </Select>
        {!isMobile && <>
          <Button size="icon" variant="ghost" className="size-8" aria-label="Undo" disabled={tab !== "code"} onClick={() => editorRef.current?.undo()}><Undo2 className="size-4" /></Button>
          <Button size="icon" variant="ghost" className="size-8" aria-label="Redo" disabled={tab !== "code"} onClick={() => editorRef.current?.redo()}><Redo2 className="size-4" /></Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setTab("preview"); void refresh(); }}><Play className="size-3.5" />Run</Button>
        </>}
        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={exportZip.isPending} onClick={() => exportZip.mutate()} aria-label="Download ZIP"><Download className="size-3.5" /><span className="hidden sm:inline">{exportZip.isPending ? "Zipping…" : "ZIP"}</span></Button>
        {!isMobile && <>
          <Button size="icon" variant={showLeft ? "secondary" : "ghost"} className="size-8" aria-label="Toggle files panel" onClick={() => setShowLeft((v) => !v)}><PanelLeft className="size-4" /></Button>
          <Button size="icon" variant={showRight ? "secondary" : "ghost"} className="size-8" aria-label="Toggle chat panel" onClick={() => setShowRight((v) => !v)}><PanelRight className="size-4" /></Button>
        </>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="size-8" aria-label="Project settings"><MoreVertical className="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => { const t = window.prompt("Project name", p.title)?.trim(); if (t) void fns.update({ data: { projectId, title: t } }).then(() => qc.invalidateQueries({ queryKey: codeKeys.project(projectId) })).catch((e: unknown) => notify.fromError(e)); }}><Pencil className="size-4" />Rename project</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => downloadText("README.md", buildProjectReadme({ title: p.title, framework: p.framework, files: fileList }), "text/markdown")}><FileText className="size-4" />Download README</DropdownMenuItem>
            {p.chat_id && <DropdownMenuItem asChild><Link to="/chat/$chatId" params={{ chatId: p.chat_id }}><History className="size-4" />Open linked chat</Link></DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onSelect={() => { if (window.confirm(`Delete “${p.title}” and all its files and history? This can't be undone.`)) void fns.delProject({ data: { projectId } }).then(async () => { await qc.invalidateQueries({ queryKey: codeKeys.projects }); void navigate({ to: "/build" }); }).catch((e: unknown) => notify.fromError(e)); }}><Trash2 className="size-4" />Delete project</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );

  const dialogs = (
    <>
      <PathDialog open={newFileOpen} title="New file" initial={p.framework === "react_vite" ? "src/components/" : ""} onClose={() => setNewFileOpen(false)}
        onSubmit={async (path) => { await fns.save({ data: { projectId, path, content: "" } }); setSelected(normalizeProjectPath(path).ok ? (normalizeProjectPath(path) as { path: string }).path : path); setTab("code"); if (isMobile) setMTab("code"); await refresh(); }} />
      <PathDialog open={!!renaming} title="Rename file" initial={renaming?.path ?? ""} onClose={() => setRenaming(null)}
        onSubmit={async (path) => { if (!renaming) return; await fns.rename({ data: { projectId, fileId: renaming.id, newPath: path } }); if (selected === renaming.path) setSelected(path); await refresh(); }} />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete {deleting?.path}?</AlertDialogTitle><AlertDialogDescription>The file and its version history will be permanently removed.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { const f = deleting; if (!f) return; void fns.del({ data: { projectId, fileId: f.id } }).then(async () => { if (selected === f.path) setSelected(null); notify.success("File deleted"); await refresh(); }).catch((e: unknown) => notify.fromError(e)); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (fullscreen && !isMobile) return <div className="fixed inset-0 z-50 bg-background">{preview}</div>;

  if (isMobile) {
    return (
      <div className="flex h-svh min-h-0 flex-col">
        {toolbar}
        <div className="min-h-0 flex-1">
          {mTab === "chat" && chat}
          {mTab === "files" && fileTree}
          {mTab === "preview" && (fullscreen ? <div className="fixed inset-0 z-50 bg-background">{preview}</div> : <div className="flex h-full flex-col"><div className="min-h-0 flex-1">{preview}</div><div className="h-40 border-t">{consoleView}</div></div>)}
          {mTab === "code" && (tab === "diff" ? center : editor)}
        </div>
        <nav className="grid shrink-0 grid-cols-4 border-t bg-background pb-[env(safe-area-inset-bottom)]" aria-label="Workspace sections">
          {(["chat", "files", "preview", "code"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setMTab(t)} className={cn("py-2.5 text-xs capitalize", mTab === t ? "font-semibold text-foreground" : "text-muted-foreground")} aria-current={mTab === t ? "page" : undefined}>{t}</button>
          ))}
        </nav>
        {dialogs}
      </div>
    );
  }

  return (
    <div className="flex h-svh min-h-0 flex-col">
      {toolbar}
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        {showLeft && <><ResizablePanel id="files" defaultSize="18" minSize="12" maxSize="35" className="bg-sidebar/40">{fileTree}</ResizablePanel><ResizableHandle /></>}
        <ResizablePanel id="center" minSize="30">{center}</ResizablePanel>
        {showRight && <><ResizableHandle /><ResizablePanel id="chat" defaultSize="30" minSize="22" maxSize="50">{chat}</ResizablePanel></>}
      </ResizablePanelGroup>
      {dialogs}
    </div>
  );
}

function PathDialog({ open, title, initial, onClose, onSubmit }: { open: boolean; title: string; initial: string; onClose: () => void; onSubmit: (path: string) => Promise<void> }) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setV(initial); }, [open, initial]);
  const check = normalizeProjectPath(v);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="src/components/Header.jsx" className="font-mono" aria-label="File path" autoFocus />
        {v && !check.ok && <p className="text-xs text-destructive">{check.error}</p>}
        <DialogFooter>
          <Button disabled={!check.ok || busy} onClick={async () => { setBusy(true); try { await onSubmit(v); onClose(); } catch (e) { notify.fromError(e); } finally { setBusy(false); } }}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VersionHistory({ file, draft, onRestore }: { file: ProjectFile | null; draft: string | undefined; onRestore: (id: string) => Promise<void> }) {
  const versions = useQuery({ queryKey: file ? codeKeys.versions(file.id) : ["code", "versions", "none"], queryFn: () => listVersions(file!.id), enabled: !!file, staleTime: 0 });
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => { setPick(null); }, [file?.id]);
  if (!file) return <EmptyState title="No file selected" description="Pick a file to see its changes and history." />;
  const list = versions.data ?? [];
  const chosen = list.find((v) => v.id === pick) ?? list[1] ?? null;
  const showingDraft = draft !== undefined && draft !== file.content;
  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <div className="max-h-48 shrink-0 overflow-auto border-b md:max-h-none md:w-56 md:border-b-0 md:border-r">
        <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">History · {file.path.split("/").pop()}</p>
        {versions.isPending ? <LoadingState /> : list.map((v, i) => (
          <button key={v.id} type="button" onClick={() => setPick(v.id)} className={cn("block w-full px-3 py-1.5 text-left text-xs hover:bg-accent", chosen?.id === v.id && "bg-accent")}>
            <span className="font-medium">v{v.version_number}</span> <span className="text-muted-foreground">· {v.change_source}{i === 0 ? " · current" : ""}</span>
            <span className="block truncate text-muted-foreground">{v.change_summary ?? ""}</span>
            <span className="block text-[10px] text-muted-foreground/70">{new Date(v.created_at).toLocaleString()}</span>
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 text-xs">
        {showingDraft ? (
          <><p className="mb-2 text-muted-foreground">Unsaved edits vs saved file</p><DiffView before={file.content} after={draft} /></>
        ) : chosen && list[0] && chosen.id !== list[0].id ? (
          <>
            <div className="mb-2 flex items-center gap-2"><span className="text-muted-foreground">v{chosen.version_number} → current</span>
              <Button size="sm" variant="secondary" className="ml-auto h-7 text-xs" onClick={() => void onRestore(chosen.id)}><History className="size-3" />Restore v{chosen.version_number}</Button></div>
            <DiffView before={chosen.content} after={file.content} />
          </>
        ) : <p className="text-muted-foreground">Only one version so far. Edits and applied AI changes create new versions you can compare and restore here. AI proposals are reviewed in the chat panel.</p>}
      </div>
    </div>
  );
}
