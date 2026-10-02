import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, ErrorState } from "@/components/states";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notify } from "@/lib/toast";
import { PROVIDERS, SAFE_CONNECTION_COLUMNS, deleteConnection, upsertConnection, type ProviderValue } from "@/lib/connections.functions";

type Scope = "personal" | "global";

export interface ConnectionRow {
  id: string;
  scope: string;
  name: string;
  provider_type: string;
  base_url: string | null;
  key_hint: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

const providerLabel = (v: string) => PROVIDERS.find((p) => p.value === v)?.label ?? v;

export function connectionsQueryKey(scope: Scope) {
  return ["connections", scope] as const;
}

export function ConnectionsManager({ scope, canEdit }: { scope: Scope; canEdit: boolean }) {
  const qc = useQueryClient();
  const upsert = useServerFn(upsertConnection);
  const remove = useServerFn(deleteConnection);
  const [editing, setEditing] = useState<ConnectionRow | null | "new">(null);

  const list = useQuery({
    queryKey: connectionsQueryKey(scope),
    queryFn: async (): Promise<ConnectionRow[]> => {
      const { data, error } = await supabase.from("connections").select(SAFE_CONNECTION_COLUMNS)
        .eq("scope", scope).order("created_at", { ascending: false });
      if (error) throw new Error("Couldn't load connections.");
      return data as ConnectionRow[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["connections"] });

  const toggle = useMutation({
    mutationFn: (c: ConnectionRow) =>
      upsert({ data: { id: c.id, scope, name: c.name, providerType: c.provider_type as ProviderValue, ...(c.base_url ? { baseUrl: c.base_url } : {}), enabled: !c.enabled } }),
    onSuccess: (_d, c) => { notify.success(c.enabled ? "Connection disabled" : "Connection enabled"); void refresh(); },
    onError: (e) => notify.fromError(e),
  });

  async function handleDelete(c: ConnectionRow) {
    try {
      await remove({ data: { id: c.id, scope } });
      notify.success("Connection deleted");
      await refresh();
    } catch (e) {
      notify.fromError(e);
    }
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setEditing("new")}><Plus className="size-4" /> Add connection</Button>
        </div>
      )}
      {list.isPending ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : list.isError ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title={scope === "personal" ? "No personal connections" : "No shared connections"}
          description={canEdit ? "Add a provider API key. It's encrypted on the server and never shown again." : "An administrator hasn't shared any connections yet."}
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {list.data.map((c) => (
            <li key={c.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  <Badge variant="secondary">{providerLabel(c.provider_type)}</Badge>
                  {!c.enabled && <Badge variant="outline">Disabled</Badge>}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  Key {c.key_hint ?? "•••"}{c.base_url ? ` · ${c.base_url}` : ""}
                </p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <Switch checked={c.enabled} disabled={toggle.isPending} onCheckedChange={() => toggle.mutate(c)} aria-label={c.enabled ? "Disable connection" : "Enable connection"} />
                  <Button size="icon" variant="ghost" onClick={() => setEditing(c)} aria-label="Edit"><Pencil className="size-4" /></Button>
                  <ConfirmDialog
                    trigger={<Button size="icon" variant="ghost" aria-label="Delete"><Trash2 className="size-4" /></Button>}
                    title={`Delete "${c.name}"?`}
                    description="The stored API key will be permanently removed."
                    confirmLabel="Delete"
                    destructive
                    onConfirm={() => handleDelete(c)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && editing !== null && (
        <ConnectionDialog
          scope={scope}
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void refresh(); }}
          save={(data) => upsert({ data })}
        />
      )}
    </div>
  );
}

type SaveInput = Parameters<typeof upsertConnection>[0]["data"];

function ConnectionDialog({ scope, initial, onClose, onSaved, save }: {
  scope: Scope; initial: ConnectionRow | null; onClose: () => void; onSaved: () => void; save: (d: SaveInput) => Promise<unknown>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [provider, setProvider] = useState<ProviderValue>((initial?.provider_type as ProviderValue) ?? "openai");
  const [baseUrl, setBaseUrl] = useState(initial?.base_url ?? "");
  const [apiKey, setApiKey] = useState(""); // never prefilled
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [busy, setBusy] = useState(false);
  const needsUrl = provider === "openai_compatible";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await save({
        ...(initial ? { id: initial.id } : {}),
        scope, name, providerType: provider, enabled,
        ...(needsUrl ? { baseUrl } : {}),
        ...(apiKey ? { apiKey } : {}),
      });
      notify.success(initial ? "Connection updated" : "Connection added");
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      notify.error(msg.startsWith("[") ? "Please check the form fields." : msg || "Couldn't save the connection.");
    } finally {
      setBusy(false);
      setApiKey("");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{initial ? "Edit connection" : "Add connection"}</DialogTitle>
            <DialogDescription>Your API key is encrypted on the server. It's never shown again or stored in your browser.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="c-provider">Provider</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as ProviderValue)}>
              <SelectTrigger id="c-provider"><SelectValue /></SelectTrigger>
              <SelectContent>{PROVIDERS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-name">Name</Label>
            <Input id="c-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="My OpenAI key" />
          </div>
          {needsUrl && (
            <div className="space-y-2">
              <Label htmlFor="c-url">Base URL</Label>
              <Input id="c-url" required type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="c-key">API key</Label>
            <Input id="c-key" type="password" autoComplete="off" required={!initial} value={apiKey} onChange={(e) => setApiKey(e.target.value)}
              placeholder={initial ? `Saved key ${initial.key_hint ?? ""} — leave blank to keep` : "Paste your API key"} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="c-enabled">Enabled</Label>
            <Switch id="c-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
