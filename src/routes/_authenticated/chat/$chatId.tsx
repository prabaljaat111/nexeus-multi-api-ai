import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useChatStream, type StreamState } from "@/lib/chat-client";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { attachmentKeys, MessageAttachments, PendingChips, useAttachmentUploads, useChatAttachments, useDropZone, useExtract } from "@/components/attachments";
import { AnalyzePicker, Citations, ContextChips, ToolFailureCard, ToolsMenu } from "@/components/chat-tools";
import type { AttachmentRow } from "@/lib/attachments";
import { ArtifactDialog, ArtifactProgress, GeneratedFileCard, artifactJobToOptions, listArtifactJobs, useArtifactGeneration, type ArtifactFormat, type ArtifactJobRow, type ArtifactOptions } from "@/components/artifact-generation";
import { GeneratedImageCard, ImageDialog, ImageProgress, jobToOptions, listImageJobs, useImageGeneration, type ImageJobRow, type ImageOptions } from "@/components/image-generation";
import {
  AlertCircle, AlertTriangle, ArrowDown, Bot, Check, ChevronsUpDown, Copy, ImageIcon, Loader2, Paperclip, Pencil, RotateCcw, SearchX, SendHorizontal,
  SlidersHorizontal, Square, Trash2,
  FilePlus2,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { Markdown } from "@/components/markdown";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  chatKeys, deleteMessage, deleteMessagesFrom, getChat, listImageModels, listMessages, listSelectableModels, updateChat,
  type ChatDetail, type ChatMessage, type ChatPatch, type SelectableModel,
} from "@/lib/chats";

export const Route = createFileRoute("/_authenticated/chat/$chatId")({
  head: () => ({
    meta: [
      { title: "Conversation — Unified AI Workspace" },
      { name: "description", content: "View a conversation in Unified AI Workspace." },
      { property: "og:title", content: "Conversation — Unified AI Workspace" },
      { property: "og:description", content: "View a conversation in Unified AI Workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatThread,
});

function ChatThread() {
  const { chatId } = Route.useParams();
  const qc = useQueryClient();
  const chat = useQuery({ queryKey: chatKeys.detail(chatId), queryFn: () => getChat(chatId) });
  const messages = useQuery({ queryKey: chatKeys.messages(chatId), queryFn: () => listMessages(chatId), enabled: !!chat.data });
  const models = useQuery({ queryKey: chatKeys.selectableModels, queryFn: listSelectableModels });
  const [editing, setEditing] = useState<ChatMessage | null>(null);

  const save = useMutation({
    mutationFn: (patch: ChatPatch) => updateChat(chatId, patch),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["chats"] }); },
    onError: (e) => notify.fromError(e),
  });

  const attachments = useChatAttachments(chatId);
  const attachmentsByMessage = useMemo(() => {
    const map = new Map<string, AttachmentRow[]>();
    (attachments.data ?? []).forEach((a) => { if (a.message_id) map.set(a.message_id, [...(map.get(a.message_id) ?? []), a]); });
    return map;
  }, [attachments.data]);
  const imageModels = useQuery({ queryKey: chatKeys.imageModels, queryFn: listImageModels });
  const imageJobs = useQuery({ queryKey: chatKeys.imageJobs(chatId), queryFn: () => listImageJobs(chatId) });
  const jobsByMessage = useMemo(() => {
    const map = new Map<string, ImageJobRow>();
    (imageJobs.data ?? []).forEach((j) => { if (j.message_id) map.set(j.message_id, j); });
    return map;
  }, [imageJobs.data]);
  const [imageDialog, setImageDialog] = useState<{ initial: Partial<ImageOptions> | null } | null>(null);
  const openImageDialog = useCallback((initial: Partial<ImageOptions> | null) => setImageDialog({ initial }), []);
  const artifactJobs = useQuery({ queryKey: ["artifactJobs", chatId], queryFn: () => listArtifactJobs(chatId) });
  const artifactsByMessage = useMemo(() => {
    const map = new Map<string, ArtifactJobRow>();
    (artifactJobs.data ?? []).forEach((j) => { if (j.output_message_id) map.set(j.output_message_id, j); });
    return map;
  }, [artifactJobs.data]);
  const [artifactDialog, setArtifactDialog] = useState<{ initial: Partial<ArtifactOptions> | null } | null>(null);
  const [attachRequest, setAttachRequest] = useState<{ row: AttachmentRow; n: number } | null>(null);
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["artifactJobs", chatId] });
    void qc.invalidateQueries({ queryKey: chatKeys.imageJobs(chatId) });
    void qc.invalidateQueries({ queryKey: chatKeys.messages(chatId) });
    void qc.invalidateQueries({ queryKey: chatKeys.detail(chatId) });
    void qc.invalidateQueries({ queryKey: chatKeys.list });
    void qc.invalidateQueries({ queryKey: attachmentKeys.chat(chatId) });
  }, [qc, chatId]);
  const onStreamError = useCallback((m: string) => notify.error(m), []);
  const stream = useChatStream(refresh, onStreamError);
  const images = useImageGeneration(chatId, refresh);
  const selectedId = chat.data?.selected_model_id && models.data?.some((m) => m.id === chat.data?.selected_model_id) ? chat.data.selected_model_id : null;
  const artifacts = useArtifactGeneration(chatId, selectedId, refresh);

  const removeMsg = useMutation({
    mutationFn: (id: string) => deleteMessage(id),
    onSuccess: () => { notify.success("Message deleted"); refresh(); },
    onError: (e) => notify.fromError(e),
  });

  if (chat.isPending) {
    return (<><PageHeader title="Loading…" /><div className="space-y-3 p-6"><Skeleton className="h-16 w-2/3" /><Skeleton className="ml-auto h-12 w-1/2" /></div></>);
  }
  if (chat.isError) return (<><PageHeader title="Chat" /><ErrorState message={chat.error.message} onRetry={() => void chat.refetch()} /></>);
  if (!chat.data) {
    return (
      <>
        <PageHeader title="Conversation" />
        <EmptyState icon={SearchX} title="Conversation not found" description="It may have been deleted, or you don't have access to it."
          action={<Button asChild variant="outline" size="sm"><Link to="/chat">Back to chats</Link></Button>} />
      </>
    );
  }

  const c = chat.data;
  const selectedModel = models.data?.find((m) => m.id === c.selected_model_id) ?? null;
  const modelUnavailable = !!c.selected_model_id && !!models.data && !selectedModel;

  /** Phase 1 regenerate: remove the latest assistant reply, then generate a replacement. */
  async function regenerate(lastAssistant: ChatMessage | null) {
    if (!selectedModel || stream.busy) return;
    try {
      if (lastAssistant) await deleteMessage(lastAssistant.id);
      void stream.send({ chatId, modelId: selectedModel.id, regenerate: true });
    } catch (e) { notify.fromError(e); refresh(); }
  }

  /** Edit: drop the original user message and everything after it, then resend the edited text. */
  async function resendEdited(original: ChatMessage, text: string) {
    if (!selectedModel || stream.busy) return;
    try {
      await deleteMessagesFrom(chatId, original.created_at);
      await qc.invalidateQueries({ queryKey: chatKeys.messages(chatId) });
      setEditing(null);
      void stream.send({ chatId, modelId: selectedModel.id, message: text });
    } catch (e) { notify.fromError(e); refresh(); }
  }

  const hint = !models.data?.length ? "No models available — fetch models in Settings → Connections."
    : modelUnavailable ? "The selected model is no longer available. Choose another model."
    : !selectedModel ? "Select a model to start chatting." : "Enter to send · Shift+Enter for a new line";

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <PageHeader
        title={c.title}
        actions={
          <div className="flex items-center gap-1 sm:gap-2">
            <ModelSelector models={models.data} loading={models.isPending} error={models.isError} onRetry={() => void models.refetch()}
              selected={selectedModel} unavailable={modelUnavailable}
              onChange={(m) => save.mutate({ selected_model_id: m.id, selected_connection_id: m.connection_id }, { onSuccess: () => notify.success(`Model set to ${m.display_name}`) })} />
            <ChatSettings chat={c} onSave={(p) => save.mutateAsync(p).then(() => { notify.success("Chat settings saved"); })} />
          </div>
        }
      />
      {modelUnavailable && (
        <div role="alert" className="flex items-center gap-2 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />This model is no longer available. Choose another model from the selector above.
        </div>
      )}
      <MessageList query={messages} hasModels={(models.data?.length ?? 0) > 0} stream={stream.state} canAct={!!selectedModel && !stream.busy}
        editingId={editing?.id ?? null}
        onRegenerate={(a) => void regenerate(a)} onEdit={setEditing} onCancelEdit={() => setEditing(null)}
        onSubmitEdit={(m, t) => void resendEdited(m, t)} onDelete={(m) => removeMsg.mutateAsync(m.id).then(() => undefined, () => undefined)}
        attachmentsByMessage={attachmentsByMessage} onAttachmentsChanged={refresh}
        jobsByMessage={jobsByMessage} canGenerateImage={!images.pending && !stream.busy}
        onImageVariation={(j) => openImageDialog(jobToOptions(j))}
        artifactsByMessage={artifactsByMessage} canGenerateFile={!artifacts.pending && !stream.busy && !!selectedModel}
        onFileRegenerate={(j) => setArtifactDialog({ initial: artifactJobToOptions(j) })}
        onAttachFile={(row) => setAttachRequest((p) => ({ row, n: (p?.n ?? 0) + 1 }))}
        imageProgress={images.pending || artifacts.pending ? <>
          {images.pending && <ImageProgress prompt={images.pending.prompt} cancelling={images.pending.cancelling} onCancel={() => void images.cancel()} />}
          {artifacts.pending && <ArtifactProgress format={artifacts.pending.format} cancelling={artifacts.pending.cancelling} onCancel={() => void artifacts.cancel()} />}
        </> : images.failed || artifacts.failed ? <>
          {images.failed && <ToolFailureCard title="Image generation failed" message={images.failed.message} onDismiss={images.dismissFailure} onRetry={() => { const o = images.failed!.options; void images.generate(o); }} />}
          {artifacts.failed && <ToolFailureCard title={`${artifacts.failed.options.format.toUpperCase()} file wasn't created`} message={artifacts.failed.message} onDismiss={artifacts.dismissFailure} onRetry={() => { const o = artifacts.failed!.options; void artifacts.generate(o); }} />}
        </> : null} />
      <ArtifactDialog open={!!artifactDialog} onOpenChange={(o) => { if (!o) setArtifactDialog(null); }} initial={artifactDialog?.initial ?? null}
        messages={messages.data} hasModel={!!selectedModel} onSubmit={(o) => void artifacts.generate(o)} />
      <ImageDialog open={!!imageDialog} onOpenChange={(o) => { if (!o) setImageDialog(null); }} models={imageModels.data} initial={imageDialog?.initial ?? null}
        onSubmit={(o) => void images.generate(o)} />
      <Composer chatId={chatId} disabled={!selectedModel} busy={stream.busy} onStop={stream.stop}
        fileBusy={!!artifacts.pending} onFile={(format, instruction) => setArtifactDialog({ initial: format ? { format, ...(instruction ? { instruction } : {}) } : null })}
        attachRequest={attachRequest} chatAttachments={attachments.data} vision={!!selectedModel?.vision}
        imageBusy={!!images.pending} onImage={(prompt) => openImageDialog(prompt ? { prompt } : null)}
        onSend={(text, attachmentIds, contextAttachmentIds) => { if (selectedModel) void stream.send({ chatId, modelId: selectedModel.id, message: text, attachmentIds, contextAttachmentIds }); }}
        onAttachmentsRefresh={() => void qc.invalidateQueries({ queryKey: attachmentKeys.chat(chatId) })} hint={hint} />
    </div>
  );
}

const SCOPE_LABEL = { personal: "Personal", global: "Shared" } as const;

function ModelSelector({ models, loading, error, onRetry, selected, unavailable, onChange }: {
  models: SelectableModel[] | undefined; loading: boolean; error: boolean; onRetry: () => void;
  selected: SelectableModel | null; unavailable: boolean; onChange: (m: SelectableModel) => void;
}) {
  const [open, setOpen] = useState(false);
  if (loading) return <Skeleton className="h-9 w-40" />;
  if (error) return <Button size="sm" variant="outline" onClick={onRetry}><RotateCcw className="size-4" />Retry models</Button>;
  if (!models?.length) {
    return <Button asChild size="sm" variant="outline"><Link to="/settings/connections">Manage connections</Link></Button>;
  }
  const groups = new Map<string, { label: string; scope: SelectableModel["scope"]; items: SelectableModel[] }>();
  models.forEach((m) => {
    const g = groups.get(m.connection_id) ?? { label: `${m.connection_name} · ${m.provider_type}`, scope: m.scope, items: [] };
    g.items.push(m);
    groups.set(m.connection_id, g);
  });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} aria-label="Select model"
          className={cn("h-9 w-40 justify-between font-normal sm:w-60", unavailable && "border-destructive text-destructive")}>
          <span className="truncate">{selected?.display_name ?? (unavailable ? "Model unavailable" : "Select a model")}</span>
          {unavailable ? <AlertTriangle className="size-4 shrink-0" /> : <ChevronsUpDown className="size-4 shrink-0 opacity-50" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <Command filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Search models…" />
          <CommandList className="max-h-80">
            <CommandEmpty>No models match.</CommandEmpty>
            {[...groups.entries()].map(([id, g]) => (
              <CommandGroup key={id} heading={<span className="flex items-center gap-2">{g.label}<Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{SCOPE_LABEL[g.scope]}</Badge></span>}>
                {g.items.map((m) => (
                  <CommandItem key={m.id} value={`${m.display_name} ${m.provider_model_id} ${m.id}`} onSelect={() => { onChange(m); setOpen(false); }}>
                    <Check className={cn("size-4", selected?.id === m.id ? "opacity-100" : "opacity-0")} />
                    <div className="min-w-0">
                      <div className="truncate">{m.display_name}</div>
                      <div className="truncate font-mono text-xs text-muted-foreground">{m.provider_model_id}</div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          <div className="border-t p-1">
            <Button asChild variant="ghost" size="sm" className="w-full justify-start"><Link to="/settings/connections">Manage connections</Link></Button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ChatSettings({ chat, onSave }: { chat: ChatDetail; onSave: (p: ChatPatch) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [temp, setTemp] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState("");
  const [topP, setTopP] = useState(1);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setPrompt(chat.system_prompt ?? "");
    setTemp(chat.temperature ?? 0.7);
    setMaxTokens(chat.max_tokens?.toString() ?? "");
    setTopP(chat.top_p ?? 1);
  }, [open, chat]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const mt = maxTokens.trim() ? Number(maxTokens) : null;
    if (mt !== null && (!Number.isInteger(mt) || mt < 1 || mt > 1_000_000)) { notify.error("Max tokens must be a whole number between 1 and 1,000,000."); return; }
    setSaving(true);
    void onSave({ system_prompt: prompt.trim() ? prompt.slice(0, 20000) : null, temperature: temp, top_p: Math.max(0.01, topP), max_tokens: mt })
      .then(() => setOpen(false), () => undefined).finally(() => setSaving(false));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button size="icon" variant="ghost" aria-label="Chat settings"><SlidersHorizontal className="size-4" /></Button></PopoverTrigger>
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-1.5rem))]">
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cs-prompt">System prompt</Label>
            <Textarea id="cs-prompt" rows={4} maxLength={20000} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Optional instructions for the model" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between"><Label id="cs-temp">Temperature</Label><span className="text-xs tabular-nums text-muted-foreground">{temp.toFixed(2)}</span></div>
            <Slider aria-labelledby="cs-temp" min={0} max={2} step={0.05} value={[temp]} onValueChange={(v) => setTemp(v[0] ?? 0.7)} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between"><Label id="cs-topp">Top P</Label><span className="text-xs tabular-nums text-muted-foreground">{topP.toFixed(2)}</span></div>
            <Slider aria-labelledby="cs-topp" min={0} max={1} step={0.01} value={[topP]} onValueChange={(v) => setTopP(v[0] ?? 1)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-max">Max tokens</Label>
            <Input id="cs-max" type="number" min={1} max={1000000} inputMode="numeric" placeholder="Auto" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} />
          </div>
          <Button type="submit" size="sm" className="w-full" disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}Save settings</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function MessageList({ query, hasModels, stream, canAct, editingId, onRegenerate, onEdit, onCancelEdit, onSubmitEdit, onDelete, attachmentsByMessage, onAttachmentsChanged, jobsByMessage, canGenerateImage, onImageVariation, imageProgress, artifactsByMessage, canGenerateFile, onFileRegenerate, onAttachFile }: {
  query: { isPending: boolean; isError: boolean; data: ChatMessage[] | undefined; refetch: () => unknown };
  hasModels: boolean; stream: StreamState; canAct: boolean; editingId: string | null;
  onRegenerate: (lastAssistant: ChatMessage | null) => void; onEdit: (m: ChatMessage) => void; onCancelEdit: () => void;
  onSubmitEdit: (m: ChatMessage, text: string) => void; onDelete: (m: ChatMessage) => Promise<void>;
  attachmentsByMessage: Map<string, AttachmentRow[]>; onAttachmentsChanged: () => void;
  jobsByMessage: Map<string, ImageJobRow>; canGenerateImage: boolean; onImageVariation: (j: ImageJobRow) => void; imageProgress: React.ReactNode;
  artifactsByMessage: Map<string, ArtifactJobRow>; canGenerateFile: boolean; onFileRegenerate: (j: ArtifactJobRow) => void; onAttachFile: (row: AttachmentRow) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stick.current = atBottom;
    setShowJump(!atBottom);
  };
  const toBottom = (smooth = false) => { const el = scroller.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" }); };
  useEffect(() => { if (stream.status === "submitted") stick.current = true; }, [stream.status]);
  useEffect(() => { if (stick.current) toBottom(); }, [query.data, stream.text, stream.status, stream.pendingUserText, imageProgress]);

  let content: React.ReactNode;
  const streaming = stream.status !== "idle";
  const items = (query.data ?? []).filter((m) => m.role !== "system" && !(streaming && m.status === "streaming"));
  if (query.isPending) content = <div className="mx-auto max-w-3xl space-y-3 p-6"><Skeleton className="h-16 w-2/3" /><Skeleton className="ml-auto h-12 w-1/2" /><Skeleton className="h-24 w-3/4" /></div>;
  else if (query.isError) content = <ErrorState message="Couldn't load messages." onRetry={() => void query.refetch()} />;
  else if (items.length === 0 && !streaming && !imageProgress) {
    content = (
      <EmptyState icon={Bot} title="No messages yet"
        description={hasModels ? "Pick a model from the top bar and send a message." : "Add a provider in Settings → Connections, then click “Fetch models” to choose a model."}
        action={!hasModels ? <Button asChild size="sm" variant="outline"><Link to="/settings/connections">Manage connections</Link></Button> : undefined}
        className="h-full" />
    );
  } else {
    const last = items[items.length - 1];
    const lastAssistant = last?.role === "assistant" ? last : null;
    const lastUserId = [...items].reverse().find((m) => m.role === "user")?.id;
    content = (
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
        {items.map((m) => (
          <Bubble key={m.id} message={m} canAct={canAct}
            isEditing={editingId === m.id}
            canRegenerate={canAct && !streaming && !!last && (m.id === lastAssistant?.id)}
            canEdit={canAct && !streaming && m.role === "user" && m.id === lastUserId}
            onRegenerate={() => onRegenerate(m)} onEdit={() => onEdit(m)} onCancelEdit={onCancelEdit}
            onSubmitEdit={(t) => onSubmitEdit(m, t)} onDelete={() => onDelete(m)}
            attachments={attachmentsByMessage.get(m.id)} onAttachmentsChanged={onAttachmentsChanged}
            imageJob={jobsByMessage.get(m.id)} canGenerateImage={canGenerateImage} onImageVariation={onImageVariation}
            artifactJob={artifactsByMessage.get(m.id)} canGenerateFile={canGenerateFile} onFileRegenerate={onFileRegenerate} onAttachFile={onAttachFile} />
        ))}
        {imageProgress}
        {streaming && stream.pendingUserText && <StaticBubble role="user" content={stream.pendingUserText} />}
        {streaming && (stream.text
          ? <StaticBubble role="assistant" content={stream.text} />
          : <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite"><Loader2 className="size-4 animate-spin" />Thinking…</div>)}
        {!streaming && canAct && last?.role === "user" && (
          <div><Button size="sm" variant="outline" onClick={() => onRegenerate(null)}><RotateCcw className="size-4" />Retry</Button></div>
        )}
      </div>
    );
  }
  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto">{content}</div>
      {showJump && (
        <Button size="icon" variant="secondary" className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow" aria-label="Scroll to latest"
          onClick={() => { stick.current = true; toBottom(true); }}><ArrowDown className="size-4" /></Button>
      )}
    </div>
  );
}

const StaticBubble = memo(function StaticBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  return (
    <div className={cn("flex", role === "user" ? "justify-end" : "justify-start")}>
      <div className={cn("min-w-0 max-w-[85%] text-sm", role === "user" ? "rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground" : "w-full")}>
        {role === "user" ? <p className="whitespace-pre-wrap break-words">{content}</p> : <Markdown content={content} />}
      </div>
    </div>
  );
});

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <ActionButton label={done ? "Copied" : "Copy message"} onClick={() => {
      navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }, () => notify.error("Couldn't copy to clipboard."));
    }}>{done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}</ActionButton>
  );
}

function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <Button type="button" size="icon" variant="ghost" className="size-7 text-muted-foreground" aria-label={label} title={label} onClick={onClick}>{children}</Button>;
}

const Bubble = memo(function Bubble({ message: m, canAct, isEditing, canRegenerate, canEdit, onRegenerate, onEdit, onCancelEdit, onSubmitEdit, onDelete, attachments, onAttachmentsChanged, imageJob, canGenerateImage, onImageVariation, artifactJob, canGenerateFile, onFileRegenerate, onAttachFile }: {
  message: ChatMessage; canAct: boolean; isEditing: boolean; canRegenerate: boolean; canEdit: boolean;
  onRegenerate: () => void; onEdit: () => void; onCancelEdit: () => void; onSubmitEdit: (t: string) => void; onDelete: () => Promise<void>;
  attachments?: AttachmentRow[] | undefined; onAttachmentsChanged: () => void;
  imageJob?: ImageJobRow | undefined; canGenerateImage: boolean; onImageVariation: (j: ImageJobRow) => void;
  artifactJob?: ArtifactJobRow | undefined; canGenerateFile: boolean; onFileRegenerate: (j: ArtifactJobRow) => void; onAttachFile: (row: AttachmentRow) => void;
}) {
  const generated = (attachments ?? []).filter((a) => a.attachment_type === "generated_image");
  const docs = (attachments ?? []).filter((a) => a.attachment_type === "generated_document");
  const uploads = (attachments ?? []).filter((a) => a.attachment_type !== "generated_image" && a.attachment_type !== "generated_document");
  const isUser = m.role === "user";
  const [draft, setDraft] = useState(m.content);
  useEffect(() => { if (isEditing) setDraft(m.content); }, [isEditing, m.content]);

  if (isEditing) {
    const submit = () => { const t = draft.trim(); if (t && t.length <= 32_000) onSubmitEdit(t); };
    return (
      <div className="ml-auto w-full max-w-[85%] space-y-2">
        <Textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} aria-label="Edit message"
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancelEdit();
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
          }} />
        <p className="text-xs text-muted-foreground">Resending replaces this message and every reply after it.</p>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancelEdit}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={!draft.trim() || !canAct}>Save & resend</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("group flex flex-col", isUser ? "items-end" : "items-start")}>
      <div className={cn("min-w-0 max-w-[85%] text-sm", isUser ? "rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground" : "w-full")}>
        {isUser ? <p className="whitespace-pre-wrap break-words">{m.content}</p> : m.content ? <Markdown content={m.content} /> : null}
        {m.status === "error" && <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive"><AlertCircle className="size-3.5" />{m.error_message ?? "This response failed."}</p>}
        {m.status === "stopped" && <p className="mt-2 text-xs italic text-muted-foreground">Response stopped.</p>}
      </div>
      {generated.map((a) => (
        <div key={a.id} className="mt-2 w-full max-w-md">
          <GeneratedImageCard a={a} job={imageJob} canRegenerate={canGenerateImage} onRegenerate={onImageVariation} onDeleted={onAttachmentsChanged} />
        </div>
      ))}
      {!isUser && m.citations && <div className="w-full max-w-[85%]"><Citations c={m.citations} /></div>}
      {docs.map((a) => (
        <div key={a.id} className="mt-2 w-full max-w-md">
          <GeneratedFileCard a={a} job={artifactJob} canRegenerate={canGenerateFile} onRegenerate={onFileRegenerate} onDeleted={onAttachmentsChanged} onAttach={onAttachFile} />
        </div>
      ))}
      {uploads.length > 0 && <div className="max-w-[85%]"><MessageAttachments items={uploads} onDeleted={onAttachmentsChanged} /></div>}
      <div className={cn("mt-1 flex flex-wrap items-center gap-0.5 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100",
        (canRegenerate && m.status !== "complete") && "sm:opacity-100")}>
        {!isUser && m.model_label && <span className="mr-1 text-xs text-muted-foreground">{m.model_label}</span>}
        {m.content && <CopyButton text={m.content} />}
        {canEdit && <ActionButton label="Edit message" onClick={onEdit}><Pencil className="size-3.5" /></ActionButton>}
        {canRegenerate && <ActionButton label="Regenerate response" onClick={onRegenerate}><RotateCcw className="size-3.5" /></ActionButton>}
        {canAct && (
          <ConfirmDialog title="Delete this message?" description="The message will be permanently removed from this chat." confirmLabel="Delete" destructive
            onConfirm={onDelete}
            trigger={<Button type="button" size="icon" variant="ghost" className="size-7 text-muted-foreground" aria-label="Delete message" title="Delete message"><Trash2 className="size-3.5" /></Button>} />
        )}
      </div>
    </div>
  );
});

function Composer({ chatId, disabled, busy, hint, onSend, onStop, onImage, imageBusy, onFile, fileBusy, attachRequest, chatAttachments, vision, onAttachmentsRefresh }: {
  chatId: string; disabled: boolean; busy: boolean; hint: string; onSend: (text: string, attachmentIds: string[], contextIds: string[]) => void; onStop: () => void;
  chatAttachments: AttachmentRow[] | undefined; vision: boolean; onAttachmentsRefresh: () => void;
  onImage: (prompt: string) => void; imageBusy: boolean;
  onFile: (format: ArtifactFormat | null, instruction: string) => void; fileBusy: boolean; attachRequest: { row: AttachmentRow; n: number } | null;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploads = useAttachmentUploads(chatId);
  const drop = useDropZone(uploads.add, !disabled);
  const uploading = uploads.items.some((i) => i.status === "uploading");
  const failed = uploads.items.some((i) => i.status === "error");
  const { addExisting } = uploads;
  const extract = useExtract();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [contextRows, setContextRows] = useState<AttachmentRow[]>([]);
  useEffect(() => { setContextRows([]); }, [chatId]);
  async function useExisting(rows: AttachmentRow[]) {
    setContextRows(rows);
    const pending = rows.filter((a) => !a.extraction && !isVisionImage(a.mime_type));
    if (!pending.length) return;
    const results = await Promise.all(pending.map(async (a) => ({ a, r: await extract(a.id) })));
    const bad = results.filter((x) => x.r.status !== "complete");
    if (bad.length) {
      setContextRows((s) => s.filter((a) => !bad.some((b) => b.a.id === a.id)));
      bad.forEach((b) => notify.error(`${b.a.original_filename}: ${b.r.message ?? "AI analysis is not available for this file."}`));
    }
    onAttachmentsRefresh();
  }
  useEffect(() => { if (attachRequest) addExisting(attachRequest.row); }, [attachRequest, addExisting]);
  const ready = uploads.items.filter((i) => i.status === "done" && i.row);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);
  const canSend = !disabled && !busy && !uploading && !failed && (!!text.trim() || ready.length > 0 || contextRows.length > 0);
  const submit = () => {
    // Explicit "/image <prompt>" opens the same secure image flow (never inferred from ordinary text).
    const slash = text.trim().match(/^\/image(?:\s+([\s\S]*))?$/i);
    const fileSlash = text.trim().match(/^\/(csv|xlsx|docx|pdf)(?:\s+([\s\S]*))?$/i);
    if (fileSlash) { if (!fileBusy) { onFile(fileSlash[1]!.toLowerCase() as ArtifactFormat, (fileSlash[2] ?? "").trim()); setText(""); } return; }
    if (slash) { if (!imageBusy) { onImage((slash[1] ?? "").trim()); setText(""); } return; }
    if (!canSend) return;
    let t = text.trim();
    if (t.length > 32_000) { notify.error("Your message is too long (max 32,000 characters)."); return; }
    if (!t) t = `Attached: ${ready.map((i) => i.file.name).join(", ")}`.slice(0, 2000);
    const reading = uploads.items.some((i) => i.analysis === "reading");
    if (reading) { notify.error("Wait until your files have been read for AI."); return; }
    const included = ready.filter((i) => i.include && (i.analysis === "ready" || (i.analysis === "image" && vision))).map((i) => i.row!.id);
    const ctx = [...new Set([...included, ...contextRows.map((a) => a.id)])].slice(0, 10);
    if (!text.trim() && ctx.length) t = "Please analyze the attached file(s).";
    onSend(t, ready.map((i) => i.row!.id), ctx);
    setContextRows([]);
    setText("");
    uploads.clear();
  };
  return (
    <div className="border-t bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm" {...drop.props}>
      <form className="mx-auto max-w-3xl" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className={cn("rounded-lg border bg-card p-2 shadow-sm focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-ring/30", drop.over && "border-primary ring-2 ring-primary/30")}>
          {drop.over && <p className="pb-2 text-center text-xs text-primary">Drop files to attach (max 50 MB each)</p>}
          <ContextChips rows={contextRows} onRemove={(id) => setContextRows((s) => s.filter((a) => a.id !== id))} />
          <PendingChips items={uploads.items} onRemove={uploads.remove} onRetry={uploads.retry} onToggleInclude={uploads.toggleInclude} onReanalyze={uploads.reanalyze} vision={vision} />
          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => { if (e.target.files) uploads.add(e.target.files); e.target.value = ""; }} />
            <ToolsMenu disabled={disabled} running={{ image: imageBusy, file: fileBusy }} onUpload={() => fileRef.current?.click()}
              onAnalyze={() => setPickerOpen(true)} onImage={() => onImage("")} onFile={(f) => onFile(f, "")} />
            <Textarea ref={ref} value={text} onChange={(e) => setText(e.target.value)} disabled={disabled} rows={1}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
              placeholder={disabled ? "Select a model to start" : "Message…"} aria-label="Message"
              className="min-h-10 min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent shadow-none focus-visible:ring-0" />
            {busy ? (
              <Button type="button" size="icon" variant="secondary" onClick={onStop} aria-label="Stop response"><Square className="size-4" /></Button>
            ) : (
              <Button type="submit" size="icon" disabled={!canSend && !/^\/(image|csv|xlsx|docx|pdf)\b/i.test(text.trim())} aria-label="Send"><SendHorizontal className="size-4" /></Button>
            )}
          </div>
        </div>
        <AnalyzePicker open={pickerOpen} onOpenChange={setPickerOpen} attachments={chatAttachments} selected={contextRows.map((a) => a.id)} vision={vision}
          onConfirm={(rows) => void useExisting(rows)} />
        <p className="mt-1.5 text-center text-xs text-muted-foreground">{uploading ? "Waiting for uploads to finish…" : failed ? "Retry or remove failed uploads to send." : hint}</p>
      </form>
    </div>
  );
}
