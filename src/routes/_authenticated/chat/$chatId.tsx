import { createFileRoute, Link } from "@tanstack/react-router";
import { SearchX } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/chat/$chatId")({
  head: () => ({
    meta: [
      { title: "Conversation — Unified AI Workspace" },
      { name: "description", content: "View a conversation in Unified AI Workspace." },
      { property: "og:title", content: "Conversation — Unified AI Workspace" },
      { property: "og:description", content: "View a conversation in Unified AI Workspace." },
    ],
  }),
  component: ChatThread,
});

function ChatThread() {
  return (
    <>
      <PageHeader title="Conversation" />
      <EmptyState
        icon={SearchX}
        title="Conversation not found"
        description="Saved conversations aren't available yet."
        action={<Button asChild variant="outline" size="sm"><Link to="/chat">Start a new chat</Link></Button>}
      />
    </>
  );
}
