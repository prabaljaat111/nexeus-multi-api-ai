import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notify } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import { adminUpdateUser, listAdminUsers, type AdminUserRow } from "@/lib/admin-users.functions";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "Users — Admin — Unified AI Workspace" },
      { name: "description", content: "Approve, disable and manage roles for workspace users." },
      { property: "og:title", content: "Users — Admin — Unified AI Workspace" },
      { property: "og:description", content: "Approve, disable and manage roles for workspace users." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminUsersPage,
});

type Filter = "all" | "pending" | "approved" | "disabled" | "admins";
type Action = "approve" | "unapprove" | "disable" | "enable" | "grant_admin" | "remove_admin";

const SUCCESS: Record<Action, string> = {
  approve: "User approved",
  unapprove: "Approval revoked",
  disable: "User disabled",
  enable: "User enabled",
  grant_admin: "Admin role granted",
  remove_admin: "Admin role removed",
};

function AdminUsersPage() {
  const list = useServerFn(listAdminUsers);
  const update = useServerFn(adminUpdateUser);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const me = useQuery({
    queryKey: ["me-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => list() });

  const mutation = useMutation({
    mutationFn: (vars: { userId: string; action: Action }) => update({ data: vars }),
    onSuccess: (_d, vars) => {
      notify.success(SUCCESS[vars.action]);
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => notify.fromError(e),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (users.data ?? []).filter((u) => {
      if (q && !`${u.displayName ?? ""} ${u.email ?? ""}`.toLowerCase().includes(q)) return false;
      if (filter === "pending") return !u.isApproved;
      if (filter === "approved") return u.isApproved;
      if (filter === "disabled") return u.isDisabled;
      if (filter === "admins") return u.isAdmin;
      return true;
    });
  }, [users.data, search, filter]);

  const run = (userId: string, action: Action) => mutation.mutateAsync({ userId, action }).catch(() => undefined);

  return (
    <>
      <PageHeader title="Users" description="Admin · manage accounts and roles" />
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input className="pl-8" placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search users" />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="sm:w-44" aria-label="Filter users"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            <SelectItem value="pending">Pending approval</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
            <SelectItem value="admins">Admins</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="px-4 pb-8">
        {users.isPending ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : users.isError ? (
          <ErrorState message={users.error instanceof Error ? users.error.message : undefined} onRetry={() => void users.refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Users} title={users.data.length === 0 ? "No users yet" : "No matching users"} description={users.data.length === 0 ? "Users appear here after they sign up." : "Try a different search or filter."} />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Approval</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Signed up</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <UserRow key={u.id} user={u} isSelf={u.id === me.data} busy={mutation.isPending && mutation.variables?.userId === u.id} run={run} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}

function UserRow({ user: u, isSelf, busy, run }: { user: AdminUserRow; isSelf: boolean; busy: boolean; run: (id: string, a: Action) => Promise<unknown> }) {
  const name = u.displayName || u.email || "this user";
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{u.displayName || "—"}{isSelf && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}</div>
        <div className="text-xs text-muted-foreground">{u.email ?? "—"}</div>
      </TableCell>
      <TableCell><Badge variant={u.isAdmin ? "default" : "secondary"}>{u.isAdmin ? "Admin" : "User"}</Badge></TableCell>
      <TableCell><Badge variant={u.isApproved ? "secondary" : "outline"}>{u.isApproved ? "Approved" : "Pending"}</Badge></TableCell>
      <TableCell><Badge variant={u.isDisabled ? "destructive" : "secondary"}>{u.isDisabled ? "Disabled" : "Active"}</Badge></TableCell>
      <TableCell className="whitespace-nowrap text-sm">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
      <TableCell>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(u.id, u.isApproved ? "unapprove" : "approve")}>
            {u.isApproved ? "Unapprove" : "Approve"}
          </Button>
          {u.isDisabled ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(u.id, "enable")}>Enable</Button>
          ) : (
            <ConfirmDialog
              trigger={<Button size="sm" variant="outline" disabled={busy || isSelf} title={isSelf ? "You can't disable yourself" : undefined}>Disable</Button>}
              title={`Disable ${name}?`}
              description="They will be signed out of the app and blocked until re-enabled."
              confirmLabel="Disable"
              destructive
              onConfirm={() => run(u.id, "disable")}
            />
          )}
          {u.isAdmin ? (
            <ConfirmDialog
              trigger={<Button size="sm" variant="outline" disabled={busy}>Remove admin</Button>}
              title={`Remove admin role from ${name}?`}
              description={isSelf ? "You will lose access to admin pages immediately." : "They will lose access to admin pages."}
              confirmLabel="Remove admin"
              destructive
              onConfirm={() => run(u.id, "remove_admin")}
            />
          ) : (
            <ConfirmDialog
              trigger={<Button size="sm" variant="outline" disabled={busy}>Make admin</Button>}
              title={`Grant admin role to ${name}?`}
              description="Admins can approve, disable and promote any user."
              confirmLabel="Grant admin"
              onConfirm={() => run(u.id, "grant_admin")}
            />
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
