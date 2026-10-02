import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingState } from "@/components/states";
import { myProfileQuery } from "@/lib/auth";

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

function ProfilePage() {
  const { user, isAdmin } = Route.useRouteContext();
  const profile = useQuery(myProfileQuery(user.id));

  return (
    <>
      <PageHeader title="Profile" description="Your account details" />
      <div className="mx-auto w-full max-w-2xl p-6">
        {profile.isPending ? (
          <LoadingState />
        ) : profile.isError ? (
          <ErrorState message={profile.error.message} onRetry={() => profile.refetch()} />
        ) : (
          <dl className="divide-y rounded-lg border bg-card text-sm">
            <Row label="Display name" value={profile.data?.display_name ?? "—"} />
            <Row label="Email" value={user.email ?? "—"} />
            <Row label="Role" value={isAdmin ? "Admin" : "User"} />
            <Row label="Member since" value={new Date(user.created_at).toLocaleDateString()} />
          </dl>
        )}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium text-card-foreground">{value}</dd>
    </div>
  );
}
