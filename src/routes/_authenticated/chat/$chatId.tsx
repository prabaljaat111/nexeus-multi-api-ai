import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Bot, SearchX, SendHorizontal, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  chatKeys, getChat, listMessages, listSelectableModels, updateChat, type ChatDetail, type ChatMessage, type ChatPatch, type SelectableModel,
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

  const save = useMutation({
    mutationFn: (patch: ChatPatch) => updateChat(chatId, patch),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["chats"] }); },
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

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <PageHeader
        title={c.title}
        actions={
          <div className="flex items-center gap-2">
            <ModelSelector models={models.data} loading={models.isPending} value={selectedModel?.id ?? null}
              onChange={(m) => save.mutate({ selected_model_id: m.id, selected_connection_id: m.connection_id })} />
            <ChatSettings chat={c} onSave={(p) => save.mutateAsync(p).then(() => { notify.success("Chat settings saved"); })} />
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <MessageList query={messages} hasModels={(models.data?.length ?? 0) > 0} />
      </div>
      <Composer disabled={!selectedModel} hint={!models.data?.length ? "No models available — fetch models in Settings → Connections." : !selectedModel ? "Select a model to start chatting." : "Sending messages arrives in the next phase."} />
    </div>
  );
}

function ModelSelector({ models, loading, value, onChange }: {
  models: SelectableModel[] | undefined; loading: boolean; value: string | null; onChange: (m: SelectableModel) => void;
}) {
  if (loading) return <Skeleton className="h-9 w-40" />;
  if (!models?.length) {
    return <Button asChild size="sm" variant="outline"><Link to="/settings/connections">Add a model</Link></Button>;
  }
  const byConn = new Map<string, SelectableModel[]>();
  models.forEach((m) => byConn.set(m.connection_name, [...(byConn.get(m.connection_name) ?? []), m]));
  return (
    <Select value={value ?? ""} onValueChange={(id) => { const m = models.find((x) => x.id === id); if (m) onChange(m); }}>
      <SelectTrigger className="h-9 w-40 sm:w-56" aria-label="Select model"><SelectValue placeholder="Select a model" /></SelectTrigger>
      <SelectContent>
        {[...byConn.entries()].map(([name, items]) => (
          <SelectGroup key={name}>
            <SelectLabel>{name}</SelectLabel>
            {items.map((m) => <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>)}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

function ChatSettings({ chat, onSave }: { chat: ChatDetail; onSave: (p: ChatPatch) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [temp, setTemp] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [topP, setTopP] = useState("");
  useEffect(() => {
    if (!open) return;
    setPrompt(chat.system_prompt ?? "");
    setTemp(chat.temperature?.toString() ?? "0.7");
    setMaxTokens(chat.max_tokens?.toString() ?? "");
    setTopP(chat.top_p?.toString() ?? "1");
  }, [open, chat]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = Number(temp), p = Number(topP), mt = maxTokens.trim() ? Number(maxTokens) : null;
    if (!Number.isFinite(t) || t < 0 || t > 2) { notify.error("Temperature must be between 0 and 2."); return; }
    if (!Number.isFinite(p) || p <= 0 || p > 1) { notify.error("Top P must be greater than 0 and at most 1."); return; }
    if (mt !== null && (!Number.isInteger(mt) || mt < 1 || mt > 1_000_000)) { notify.error("Max tokens must be a whole number between 1 and 1,000,000."); return; }
    void onSave({ system_prompt: prompt.trim() ? prompt.slice(0, 20000) : null, temperature: t, top_p: p, max_tokens: mt }).then(() => setOpen(false), () => undefined);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button size="icon" variant="ghost" aria-label="Chat settings"><SlidersHorizontal className="size-4" /></Button></PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cs-prompt">System prompt</Label>
            <Textarea id="cs-prompt" rows={4} maxLength={20000} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Optional instructions for the model" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5"><Label htmlFor="cs-temp">Temperature</Label><Input id="cs-temp" inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="cs-topp">Top P</Label><Input id="cs-topp" inputMode="decimal" value={topP} onChange={(e) => setTopP(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="cs-max">Max tokens</Label><Input id="cs-max" inputMode="numeric" placeholder="Auto" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} /></div>
          </div>
          <Button type="submit" size="sm" className="w-full">Save settings</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function MessageList({ query, hasModels }: { query: { isPending: boolean; isError: boolean; data: ChatMessage[] | undefined; refetch: () => unknown }; hasModels: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [query.data?.length]);

  if (query.isPending) return <div className="space-y-3 p-6"><Skeleton className="h-16 w-2/3" /><Skeleton className="ml-auto h-12 w-1/2" /></div>;
  if (query.isError) return <ErrorState message="Couldn't load messages." onRetry={() => void query.refetch()} />;
  const items = (query.data ?? []).filter((m) => m.role !== "system");
  if (items.length === 0) {
    return (
      <EmptyState icon={Bot} title="No messages yet"
        description={hasModels ? "Pick a model from the top bar to get started." : "Add a provider in Settings → Connections, then click “Fetch models” to choose a model."}
        action={!hasModels ? <Button asChild size="sm" variant="outline"><Link to="/settings/connections">Go to Connections</Link></Button> : undefined}
        className="h-full" />
    );
  }
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
      {items.map((m) => (
        <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
          <div className={cn("min-w-0 max-w-[85%] text-sm", m.role === "user" ? "rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground" : "w-full")}>
            {m.role === "user" ? <p className="whitespace-pre-wrap break-words">{m.content}</p> : <Markdown content={m.content} />}
            {m.status === "error" && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive"><AlertCircle className="size-3.5" />{m.error_message ?? "This response failed."}</p>
            )}
            {m.status === "stopped" && <p className="mt-2 text-xs text-muted-foreground">Response stopped.</p>}
          </div>
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}

function Composer({ disabled, hint }: { disabled: boolean; hint: string }) {
  const [text, setText] = useState("");
  return (
    <div className="border-t bg-background p-3">
      <form className="mx-auto max-w-3xl" onSubmit={(e) => { e.preventDefault(); notify.info("Sending messages arrives in the next phase."); }}>
        <div className="flex items-end gap-2 rounded-xl border bg-card p-2 focus-within:ring-2 focus-within:ring-ring">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} disabled={disabled} rows={1}
            placeholder={disabled ? "Select a model to start" : "Message…"} aria-label="Message"
            className="max-h-48 min-h-10 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0" />
          <Button type="submit" size="icon" disabled={disabled || !text.trim()} aria-label="Send"><SendHorizontal className="size-4" /></Button>
        </div>
        <p className="mt-1.5 text-center text-xs text-muted-foreground">{hint}</p>
      </form>
    </div>
  );
}
