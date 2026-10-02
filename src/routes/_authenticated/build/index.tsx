import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Code2, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { codeKeys, listProjects } from "@/lib/code-projects";
import { NewProjectDialog } from "@/components/code/new-project-dialog";

export const Route = createFileRoute("/_authenticated/build/")({
  head: () => ({
    meta: [
      { title: "Build — Unified AI Workspace" },
      { name: "description", content: "AI coding workspace: generate, review, preview and export website projects." },
      { property: "og:title", content: "Build — Unified AI Workspace" },
      { property: "og:description", content: "AI coding workspace: generate, review, preview and export website projects." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuildHome,
});

function BuildHome() {
  const projects = useQuery({ queryKey: codeKeys.projects, queryFn: listProjects });
  const newBtn = <Button size="sm"><Plus className="size-4" />New project</Button>;
  return (
    <>
      <PageHeader title="Build" description="AI coding workspace" actions={<NewProjectDialog trigger={newBtn} />} />
      <div className="mx-auto w-full max-w-4xl flex-1 overflow-auto p-4">
        {projects.isPending ? <LoadingState /> : projects.isError ? <ErrorState message={projects.error.message} onRetry={() => void projects.refetch()} /> :
          projects.data.length === 0 ? (
            <EmptyState icon={Code2} title="No projects yet" description="Create a project, then describe the website or app you want. You review every change before it's applied." action={<NewProjectDialog trigger={newBtn} />} />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {projects.data.map((p) => (
                <li key={p.id}>
                  <Link to="/build/$projectId" params={{ projectId: p.id }} className="block rounded-lg border bg-card p-4 transition-colors hover:border-primary/50">
                    <p className="truncate font-medium">{p.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{p.framework === "react_vite" ? "React + Vite" : "Static HTML"} · updated {new Date(p.updated_at).toLocaleString()}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </div>
    </>
  );
}
