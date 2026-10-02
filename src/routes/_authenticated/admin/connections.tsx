import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { ConnectionsManager } from "@/components/connections-manager";

export const Route = createFileRoute("/_authenticated/admin/connections")({
  head: () => ({
    meta: [
      { title: "Connections — Admin — Unified AI Workspace" },
      { name: "description", content: "Manage workspace-wide AI provider connections." },
      { property: "og:title", content: "Connections — Admin — Unified AI Workspace" },
      { property: "og:description", content: "Manage workspace-wide AI provider connections." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <>
      <PageHeader title="Workspace connections" description="Admin · shared AI providers available to all approved users" />
      <div className="p-4"><ConnectionsManager scope="global" canEdit /></div>
    </>
  ),
});
