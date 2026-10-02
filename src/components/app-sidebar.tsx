import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { ChevronsUpDown, Cpu, KeyRound, LogOut, MessageSquare, Plus, Settings, Shield, UserRound } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ChatHistory } from "@/components/chat-history";
import { supabase } from "@/integrations/supabase/client";
import { chatKeys, createChat } from "@/lib/chats";
import { notify } from "@/lib/toast";

export function AppSidebar({ user, isAdmin }: { user: User; isAdmin: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isMobile, setOpenMobile } = useSidebar();
  const closeMobile = () => { if (isMobile) setOpenMobile(false); };

  const newChat = useMutation({
    mutationFn: () => createChat(user.id),
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.list });
      closeMobile();
      void navigate({ to: "/chat/$chatId", params: { chatId: id } });
    },
    onError: (e) => notify.fromError(e),
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <Sidebar>
      <SidebarHeader className="gap-3 p-3">
        <Link to="/chat" className="flex items-center gap-2 px-1" onClick={closeMobile}>
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <MessageSquare className="size-4" />
          </div>
          <span className="text-sm font-semibold">Unified AI Workspace</span>
        </Link>
        <Button variant="outline" className="justify-start" disabled={newChat.isPending} onClick={() => newChat.mutate()}>
          <Plus className="size-4" />New chat
        </Button>
      </SidebarHeader>
      <SidebarContent>
        <ChatHistory />
      </SidebarContent>
      <SidebarFooter className="border-t p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/settings/connections" onClick={closeMobile}><Settings />Settings</Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {isAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link to="/admin/users" onClick={closeMobile}><Shield />Admin</Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton className="flex-1" aria-label="Profile menu">
                    <UserRound />
                    <span className="truncate text-xs">{user.email}</span>
                    <ChevronsUpDown className="ml-auto size-3.5" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-56">
                  <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild><Link to="/settings/profile" onClick={closeMobile}><UserRound className="size-4" />Profile</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/settings/connections" onClick={closeMobile}><KeyRound className="size-4" />Connections</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/settings/models" onClick={closeMobile}><Cpu className="size-4" />Models</Link></DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void signOut()}><LogOut className="size-4" />Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <ThemeToggle />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
