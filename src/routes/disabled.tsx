import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Ban } from "lucide-react";
import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/disabled")({
  head: () => ({
    meta: [
      { title: "Account disabled — Unified AI Workspace" },
      { name: "description", content: "This Unified AI Workspace account has been disabled by an administrator." },
      { property: "og:title", content: "Account disabled — Unified AI Workspace" },
      { property: "og:description", content: "This Unified AI Workspace account has been disabled by an administrator." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DisabledPage,
});

function DisabledPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }
  return (
    <AuthCard title="Account disabled" description="An administrator has disabled your account. Contact your workspace admin to restore access.">
      <div className="flex flex-col items-center gap-4">
        <Ban className="size-8 text-destructive" />
        <Button variant="outline" className="w-full" onClick={signOut}>Sign out</Button>
      </div>
    </AuthCard>
  );
}
