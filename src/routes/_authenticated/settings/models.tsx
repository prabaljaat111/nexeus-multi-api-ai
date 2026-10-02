import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/toast";
import { PROVIDERS } from "@/lib/connections.functions";

export const Route = createFileRoute("/_authenticated/settings/models")({
  head: () => ({
    meta: [
      { title: "Models — Unified AI Workspace" },
      { name: "description", content: "Browse and enable AI models fetched from your provider connections." },
      { property: "og:title", content: "Models — Unified AI Workspace" },
      { property: "og:description", content: "Browse and enable AI models fetched from your provider connections." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ModelsPage,
});

interface ModelRow {
  id: string;
  provider_model_id: string;
  display_name: string;
  enabled: boolean;
  context_window: number | null;
  connection_id: string;
  connections: { name: string; scope: string; provider_type: string } | null;
}

function ModelsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const admin = useQuery({ queryKey: ["is-admin"], queryFn: async () => (await supabase.rpc("is_admin")).data === true });
  const models = useQuery({
    queryKey: ["models"],
    queryFn: async (): Promise<ModelRow[]> => {
      const { data, error } = await supabase.from("models")
        .select("id, provider_model_id, display_name, enabled, context_window, connection_id, connections(name, scope, provider_type)")
        .order("display_name");
      if (error) throw new Error("Couldn't load models.");
      return data as ModelRow[];
    },
  });

  const toggle = useMutation({
    mutationFn: async (m: ModelRow) => {
      const { data, error } = await supabase.from("models")
        .update({ enabled: !m.enabled, updated_at: new Date().toISOString() }).eq("id", m.id).select("id");
      if (error || !data?.length) throw new Error("You can't change this model.");
    },
    onSuccess: (_d, m) => { notify.success(m.enabled ? "Model disabled" : "Model enabled"); void qc.invalidateQueries({ queryKey: ["models"] }); },
    onError: (e) => notify.fromError(e),
  });

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, { conn: ModelRow["connections"]; items: ModelRow[] }>();
    (models.data ?? []).forEach((m) => {
      if (q && !`${m.display_name} ${m.provider_model_id}`.toLowerCase().includes(q)) return;
      const g = map.get(m.connection_id) ?? { conn: m.connections, items: [] };
      g.items.push(m);
      map.set(m.connection_id, g);
    });
    return [...map.entries()];
  }, [models.data, search]);

  const canEdit = (m: ModelRow) => m.connections?.scope === "personal" || admin.data === true;
  const providerLabel = (v?: string) => PROVIDERS.find((p) => p.value === v)?.label ?? v ?? "";

  return (
    <>
      <PageHeader title="Models" description="Models fetched from your connections" />
      <div className="space-y-4 p-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input className="pl-8" placeholder="Search models" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search models" />
        </div>
        {models.isPending ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : models.isError ? (
          <ErrorState message={models.error.message} onRetry={() => void models.refetch()} />
        ) : models.data.length === 0 ? (
          <EmptyState icon={Cpu} title="No models fetched yet" description="Add a connection and click “Fetch models” to load its real model list."
            action={<Button asChild size="sm" variant="outline"><Link to="/settings/connections">Go to connections</Link></Button>} />
        ) : groups.length === 0 ? (
          <EmptyState icon={Search} title="No matching models" description="Try a different search." />
        ) : (
          groups.map(([cid, g]) => (
            <section key={cid} className="rounded-lg border">
              <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
                <span className="font-medium">{g.conn?.name ?? "Connection"}</span>
                <Badge variant="secondary">{providerLabel(g.conn?.provider_type)}</Badge>
                <Badge variant="outline">{g.conn?.scope === "global" ? "Shared" : "Personal"}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">{g.items.length} models</span>
              </header>
              <ul className="divide-y">
                {g.items.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.display_name}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {m.provider_model_id}{m.context_window ? ` · ${m.context_window.toLocaleString()} tokens` : ""}
                      </p>
                    </div>
                    <Switch checked={m.enabled} disabled={!canEdit(m) || toggle.isPending}
                      onCheckedChange={() => toggle.mutate(m)} aria-label={`${m.enabled ? "Disable" : "Enable"} ${m.display_name}`} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </>
  );
}
