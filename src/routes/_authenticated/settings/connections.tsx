import { createFileRoute } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states";

export const Route = createFileRoute("/_authenticated/settings/connections")({
  head: () => ({
    meta: [
      { title: "Connections — Unified AI Workspace" },
      { name: "description", content: "Manage your personal AI provider connections." },
      { property: "og:title", content: "Connections — Unified AI Workspace" },
      { property: "og:description", content: "Manage your personal AI provider connections." },
    ],
  }),
  component: () => (
    <>
      <PageHeader title="Connections" description="Your AI provider connections" />
      <EmptyState
        icon={KeyRound}
        title="No connections"
        description="Provider connections arrive in the next phase. Keys will be stored server-side only, never in your browser."
      />
    </>
  ),
});
