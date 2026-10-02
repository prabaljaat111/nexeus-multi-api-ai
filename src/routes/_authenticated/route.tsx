import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login", search: { redirect: location.href } });

    const [{ data: profile }, { data: isAdmin }] = await Promise.all([
      supabase.from("profiles").select("is_disabled, is_approved").eq("id", data.user.id).maybeSingle(),
      supabase.rpc("is_admin"),
    ]);
    if (!profile || profile.is_disabled) throw redirect({ to: "/disabled", search: { reason: "disabled" } });
    if (!profile.is_approved) throw redirect({ to: "/disabled", search: { reason: "pending" } });

    return { user: data.user, isAdmin: isAdmin === true };
  },
  component: AppLayout,
});

function AppLayout() {
  const { user, isAdmin } = Route.useRouteContext();
  return (
    <SidebarProvider>
      <AppSidebar user={user} isAdmin={isAdmin} />
      <SidebarInset className="flex min-h-svh flex-col">
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
