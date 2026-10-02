import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { myProfileQuery, type Profile } from "@/lib/auth";
import { notify } from "@/lib/toast";

export const Route = createFileRoute("/_authenticated/settings/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Unified AI Workspace" },
      { name: "description", content: "Your Unified AI Workspace profile." },
      { property: "og:title", content: "Profile — Unified AI Workspace" },
      { property: "og:description", content: "Your Unified AI Workspace profile." },
    ],
  }),
  component: ProfilePage,
});

function statusOf(p: Profile): { label: string; variant: "default" | "secondary" | "destructive" } {
  if (p.is_disabled) return { label: "Disabled", variant: "destructive" };
  if (!p.is_approved) return { label: "Pending approval", variant: "secondary" };
  return { label: "Active", variant: "default" };
}

function ProfilePage() {
  const { user, isAdmin } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const profile = useQuery(myProfileQuery(user.id));
  const [name, setName] = useState("");

  useEffect(() => {
    if (profile.data) setName(profile.data.display_name ?? "");
  }, [profile.data]);

  const save = useMutation({
    mutationFn: async (display_name: string) => {
      const { error } = await supabase.from("profiles").update({ display_name }).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success("Profile saved");
      queryClient.invalidateQueries({ queryKey: myProfileQuery(user.id).queryKey });
    },
    onError: (e) => notify.fromError(e),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate(name.trim());
  }

  return (
    <>
      <PageHeader title="Profile" description="Your account details" />
      <div className="mx-auto w-full max-w-2xl space-y-6 p-4 sm:p-6">
        {profile.isPending ? (
          <LoadingState />
        ) : profile.isError ? (
          <ErrorState message={profile.error.message} onRetry={() => profile.refetch()} />
        ) : !profile.data ? (
          <ErrorState title="Profile not found" />
        ) : (
          <>
            <form onSubmit={onSubmit} className="space-y-3 rounded-lg border bg-card p-4">
              <Label htmlFor="display-name">Display name</Label>
              <div className="flex gap-2">
                <Input id="display-name" maxLength={80} required value={name} onChange={(e) => setName(e.target.value)} />
                <Button type="submit" disabled={save.isPending || name.trim() === (profile.data.display_name ?? "")}>
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>
            <dl className="divide-y rounded-lg border bg-card text-sm">
              <Row label="Email"><span className="truncate">{user.email ?? "—"}</span></Row>
              <Row label="Role"><Badge variant={isAdmin ? "default" : "secondary"}>{isAdmin ? "Admin" : "User"}</Badge></Row>
              <Row label="Account status">
                <Badge variant={statusOf(profile.data).variant}>{statusOf(profile.data).label}</Badge>
              </Row>
              <Row label="Member since">{new Date(profile.data.created_at).toLocaleDateString()}</Row>
            </dl>
          </>
        )}
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium text-card-foreground">{children}</dd>
    </div>
  );
}
