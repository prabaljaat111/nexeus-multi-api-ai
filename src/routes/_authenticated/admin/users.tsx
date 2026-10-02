import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "Users — Admin — Unified AI Workspace" },
      { name: "description", content: "Administer workspace users." },
      { property: "og:title", content: "Users — Admin — Unified AI Workspace" },
      { property: "og:description", content: "Administer workspace users." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <>
      <PageHeader title="Users" description="Admin · manage accounts and roles" />
      <EmptyState icon={Users} title="User management coming soon" description="Listing, disabling and promoting users arrives in a later phase." />
    </>
  ),
});
