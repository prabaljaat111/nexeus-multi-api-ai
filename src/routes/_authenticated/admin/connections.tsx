import { createFileRoute } from "@tanstack/react-router";
import { Plug } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states";

export const Route = createFileRoute("/_authenticated/admin/connections")({
  head: () => ({
    meta: [
      { title: "Connections — Admin — Unified AI Workspace" },
      { name: "description", content: "Manage workspace-wide AI provider connections." },
      { property: "og:title", content: "Connections — Admin — Unified AI Workspace" },
      { property: "og:description", content: "Manage workspace-wide AI provider connections." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <>
      <PageHeader title="Workspace connections" description="Admin · shared AI providers" />
      <EmptyState icon={Plug} title="No shared connections" description="Workspace-wide providers arrive in a later phase." />
    </>
  ),
});
