import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, Clock } from "lucide-react";
import { z } from "zod";
import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({ reason: z.enum(["pending", "disabled"]).optional() });

export const Route = createFileRoute("/disabled")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Account unavailable — Unified AI Workspace" },
      { name: "description", content: "Your Unified AI Workspace account is pending approval or disabled." },
      { property: "og:title", content: "Account unavailable — Unified AI Workspace" },
      { property: "og:description", content: "Your Unified AI Workspace account is pending approval or disabled." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DisabledPage,
});

function DisabledPage() {
  const { reason } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pending = reason === "pending";

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <AuthCard
      title={pending ? "Awaiting approval" : "Account disabled"}
      description={
        pending
          ? "Your account is awaiting administrator approval."
          : "Your account has been disabled. Contact an administrator."
      }
    >
      <div className="flex flex-col items-center gap-4">
        {pending ? <Clock className="size-8 text-primary" /> : <Ban className="size-8 text-destructive" />}
        {pending && (
          <Button className="w-full" onClick={() => navigate({ to: "/chat" })}>Check again</Button>
        )}
        <Button variant="outline" className="w-full" onClick={signOut}>Sign out</Button>
      </div>
    </AuthCard>
  );
}
