import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { Cpu, KeyRound, LogOut, MessageSquare, Plus, Plug, Shield, UserRound, Users } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { supabase } from "@/integrations/supabase/client";

const settingsNav = [
  { to: "/settings/profile", label: "Profile", icon: UserRound },
  { to: "/settings/connections", label: "Connections", icon: KeyRound },
  { to: "/settings/models", label: "Models", icon: Cpu },
] as const;

const adminNav = [
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/connections", label: "Connections", icon: Plug },
] as const;

export function AppSidebar({ user, isAdmin }: { user: User; isAdmin: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <Sidebar>
      <SidebarHeader className="gap-3 p-3">
        <div className="flex items-center gap-2 px-1">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <MessageSquare className="size-4" />
          </div>
          <span className="text-sm font-semibold">Unified AI Workspace</span>
        </div>
        <Button asChild variant="outline" className="justify-start">
          <Link to="/chat"><Plus className="size-4" />New chat</Link>
        </Button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/chat" activeProps={{ "data-active": true }}><MessageSquare />Chats</Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsNav.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild>
                    <Link to={item.to} activeProps={{ "data-active": true }}><item.icon />{item.label}</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel><Shield className="mr-1 size-3" />Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNav.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild>
                      <Link to={item.to} activeProps={{ "data-active": true }}><item.icon />{item.label}</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t p-3">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
            <LogOut className="size-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
