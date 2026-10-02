import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states";

export const Route = createFileRoute("/_authenticated/chat/")({
  head: () => ({
    meta: [
      { title: "Chat — Unified AI Workspace" },
      { name: "description", content: "Start a conversation with any connected AI model." },
      { property: "og:title", content: "Chat — Unified AI Workspace" },
      { property: "og:description", content: "Start a conversation with any connected AI model." },
    ],
  }),
  component: ChatHome,
});

function ChatHome() {
  return (
    <>
      <PageHeader title="New chat" />
      <EmptyState
        icon={MessageSquare}
        title="No conversations yet"
        description="Chatting arrives in the next phase. Connect a provider under Settings → Connections to get ready."
      />
    </>
  );
}
