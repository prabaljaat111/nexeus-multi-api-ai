import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { ConnectionsManager } from "@/components/connections-manager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings/connections")({
  head: () => ({
    meta: [
      { title: "Connections — Unified AI Workspace" },
      { name: "description", content: "Manage your personal and shared AI provider connections." },
      { property: "og:title", content: "Connections — Unified AI Workspace" },
      { property: "og:description", content: "Manage your personal and shared AI provider connections." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConnectionsPage,
});

function ConnectionsPage() {
  const admin = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => (await supabase.rpc("is_admin")).data === true,
  });
  return (
    <>
      <PageHeader title="Connections" description="Your AI provider connections" />
      <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        <Tabs defaultValue="personal">
          <TabsList className="grid w-full max-w-sm grid-cols-2">
            <TabsTrigger value="personal">Personal</TabsTrigger>
            <TabsTrigger value="shared">Shared</TabsTrigger>
          </TabsList>
          <TabsContent value="personal" className="mt-4"><ConnectionsManager scope="personal" canEdit /></TabsContent>
          <TabsContent value="shared" className="mt-4">
            <p className="mb-3 text-sm text-muted-foreground">
              {admin.data ? "Manage shared connections from Admin → Connections." : "Shared connections are managed by administrators."}
            </p>
            <ConnectionsManager scope="global" canEdit={false} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
