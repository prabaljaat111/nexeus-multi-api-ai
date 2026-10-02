import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, MoreHorizontal, Pencil, Search, Trash2 } from "lucide-react";
import {
  SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem, SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/toast";
import { chatKeys, deleteChat, groupChatsByDate, listChats, updateChat, type ChatSummary } from "@/lib/chats";

export function ChatHistory() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { chatId?: string };
  const [search, setSearch] = useState("");
  const [renaming, setRenaming] = useState<ChatSummary | null>(null);
  const [deleting, setDeleting] = useState<ChatSummary | null>(null);
  const [title, setTitle] = useState("");

  const chats = useQuery({ queryKey: chatKeys.list, queryFn: listChats });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["chats"] });

  const rename = useMutation({
    mutationFn: (v: { id: string; title: string }) => updateChat(v.id, { title: v.title }),
    onSuccess: () => { notify.success("Chat renamed"); setRenaming(null); void invalidate(); },
    onError: (e) => notify.fromError(e),
  });
  const archive = useMutation({
    mutationFn: (id: string) => updateChat(id, { is_archived: true }),
    onSuccess: (_d, id) => { notify.success("Chat archived"); void invalidate(); if (params.chatId === id) void navigate({ to: "/chat" }); },
    onError: (e) => notify.fromError(e),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteChat(id),
    onSuccess: (_d, id) => { notify.success("Chat deleted"); setDeleting(null); void invalidate(); if (params.chatId === id) void navigate({ to: "/chat" }); },
    onError: (e) => notify.fromError(e),
  });

  const q = search.trim().toLowerCase();
  const filtered = (chats.data ?? []).filter((c) => !q || c.title.toLowerCase().includes(q));

  return (
    <>
      <div className="relative px-2 pt-2">
        <Search className="absolute left-4 top-1/2 mt-1 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats" className="h-8 pl-7 text-sm" aria-label="Search chats" />
      </div>
      {chats.isPending ? (
        <SidebarGroup><SidebarMenu>{Array.from({ length: 4 }).map((_, i) => <SidebarMenuItem key={i}><SidebarMenuSkeleton /></SidebarMenuItem>)}</SidebarMenu></SidebarGroup>
      ) : chats.isError ? (
        <p className="px-4 py-3 text-xs text-destructive">Couldn't load chats. <button className="underline" onClick={() => void chats.refetch()}>Retry</button></p>
      ) : filtered.length === 0 ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">{q ? "No chats match your search." : "No chats yet."}</p>
      ) : (
        groupChatsByDate(filtered).map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((c) => (
                  <SidebarMenuItem key={c.id}>
                    <SidebarMenuButton asChild isActive={params.chatId === c.id}>
                      <Link to="/chat/$chatId" params={{ chatId: c.id }}><span className="truncate">{c.title}</span></Link>
                    </SidebarMenuButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction showOnHover aria-label={`Options for ${c.title}`}><MoreHorizontal /></SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="right" align="start">
                        <DropdownMenuItem onSelect={() => { setTitle(c.title); setRenaming(c); }}><Pencil className="size-4" />Rename</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => archive.mutate(c.id)}><Archive className="size-4" />Archive</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(c)}><Trash2 className="size-4" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))
      )}

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent>
          <form onSubmit={(e) => { e.preventDefault(); const t = title.trim(); if (renaming && t) rename.mutate({ id: renaming.id, title: t.slice(0, 200) }); }} className="space-y-4">
            <DialogHeader><DialogTitle>Rename chat</DialogTitle></DialogHeader>
            <Input autoFocus value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} aria-label="Chat title" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(null)}>Cancel</Button>
              <Button type="submit" disabled={!title.trim() || rename.isPending}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes the chat and all its messages.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction className={buttonVariants({ variant: "destructive" })} disabled={remove.isPending}
              onClick={(e) => { e.preventDefault(); if (deleting) remove.mutate(deleting.id); }}>
              {remove.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
