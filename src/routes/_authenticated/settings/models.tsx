import { createFileRoute } from "@tanstack/react-router";
import { Cpu } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states";

export const Route = createFileRoute("/_authenticated/settings/models")({
  head: () => ({
    meta: [
      { title: "Models — Unified AI Workspace" },
      { name: "description", content: "Choose which AI models appear in your workspace." },
      { property: "og:title", content: "Models — Unified AI Workspace" },
      { property: "og:description", content: "Choose which AI models appear in your workspace." },
    ],
  }),
  component: () => (
    <>
      <PageHeader title="Models" description="Models available to you" />
      <EmptyState icon={Cpu} title="No models available" description="Models will appear here once a provider is connected." />
    </>
  ),
});
