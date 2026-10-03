import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Cpu, KeyRound, MessageSquarePlus, Search, SunMoon } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { useSidebar } from "@/components/ui/sidebar";
import { useTheme } from "@/lib/theme";
import { chatKeys, createChat } from "@/lib/chats";
import { notify } from "@/lib/toast";

export function CommandPalette({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { resolvedTheme, setTheme } = useTheme();
  const { isMobile, setOpen: setSidebarOpen, setOpenMobile } = useSidebar();

  const newChat = useCallback(async () => {
    try {
      const id = await createChat(userId);
      void qc.invalidateQueries({ queryKey: chatKeys.list });
      void navigate({ to: "/chat/$chatId", params: { chatId: id } });
    } catch (e) { notify.fromError(e); }
  }, [userId, qc, navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      else if (mod && e.shiftKey && e.key.toLowerCase() === "o") { e.preventDefault(); void newChat(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newChat]);

  const run = (fn: () => void) => { setOpen(false); fn(); };
  const focusSearch = () => {
    if (isMobile) setOpenMobile(true); else setSidebarOpen(true);
    setTimeout(() => document.getElementById("chat-search")?.focus(), 150);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command…" />
      <CommandList>
        <CommandEmpty>No matching commands.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => run(() => void newChat())}><MessageSquarePlus />New chat<CommandShortcut>⇧⌘O</CommandShortcut></CommandItem>
          <CommandItem onSelect={() => run(focusSearch)}><Search />Search chats</CommandItem>
          <CommandItem onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}><SunMoon />Toggle theme</CommandItem>
        </CommandGroup>
        <CommandGroup heading="Go to">
          <CommandItem onSelect={() => run(() => void navigate({ to: "/settings/connections" }))}><KeyRound />Connections</CommandItem>
          <CommandItem onSelect={() => run(() => void navigate({ to: "/settings/models" }))}><Cpu />Models</CommandItem>
          <CommandItem onSelect={() => run(() => void navigate({ to: "/settings/agent" }))}><Bot />Agent Tools &amp; Workspace</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
