import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { chatKeys, createChat } from "@/lib/chats";
import { notify } from "@/lib/toast";

export const Route = createFileRoute("/_authenticated/chat/")({
  head: () => ({
    meta: [
      { title: "Chat — Unified AI Workspace" },
      { name: "description", content: "Start a conversation with any connected AI model." },
      { property: "og:title", content: "Chat — Unified AI Workspace" },
      { property: "og:description", content: "Start a conversation with any connected AI model." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatHome,
});

function ChatHome() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: () => createChat(user.id),
    onSuccess: (id) => { void qc.invalidateQueries({ queryKey: chatKeys.list }); void navigate({ to: "/chat/$chatId", params: { chatId: id } }); },
    onError: (e) => notify.fromError(e),
  });
  return (
    <>
      <PageHeader title="Chat" />
      <EmptyState
        icon={MessageSquare}
        title="Start a conversation"
        description="Create a new chat, or pick one from the sidebar. To use a model, add a provider in Settings → Connections and click “Fetch models”."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}><Plus className="size-4" />New chat</Button>
            <Button size="sm" variant="outline" asChild><Link to="/settings/connections">Connections</Link></Button>
          </div>
        }
      />
    </>
  );
}
