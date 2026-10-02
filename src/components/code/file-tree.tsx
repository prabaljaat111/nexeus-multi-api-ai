import { memo, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileCode2, FileJson, FileText, FileType2, Folder, Image as ImageIcon, MoreHorizontal, Pencil, Search, Trash2, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ProjectFile } from "@/lib/code-projects";

interface Node { name: string; path: string; file?: ProjectFile; children: Map<string, Node> }

function iconFor(path: string) {
  const ext = path.split(".").pop();
  if (ext === "json") return FileJson;
  if (ext === "md") return FileText;
  if (ext === "css") return FileType2;
  if (ext === "svg") return ImageIcon;
  return FileCode2;
}

export const FileTree = memo(function FileTree({ files, selected, dirty, onSelect, onRename, onDelete, onDownload }: {
  files: ProjectFile[]; selected: string | null; dirty: Set<string>;
  onSelect: (path: string) => void; onRename: (f: ProjectFile) => void; onDelete: (f: ProjectFile) => void; onDownload: (f: ProjectFile) => void;
}) {
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const root = useMemo(() => {
    const r: Node = { name: "", path: "", children: new Map() };
    for (const f of files) {
      if (q && !f.path.toLowerCase().includes(q.toLowerCase())) continue;
      const parts = f.path.split("/");
      let cur = r;
      parts.forEach((p, i) => {
        const path = parts.slice(0, i + 1).join("/");
        if (!cur.children.has(p)) cur.children.set(p, { name: p, path, children: new Map() });
        cur = cur.children.get(p)!;
        if (i === parts.length - 1) cur.file = f;
      });
    }
    return r;
  }, [files, q]);

  const render = (n: Node, depth: number): React.ReactNode[] => {
    const kids = [...n.children.values()].sort((a, b) => (a.file ? 1 : 0) - (b.file ? 1 : 0) || a.name.localeCompare(b.name));
    return kids.flatMap((k) => {
      if (!k.file) {
        const open = !closed.has(k.path) || !!q;
        return [
          <button key={k.path} type="button" className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-accent"
            style={{ paddingLeft: depth * 12 + 6 }} aria-expanded={open}
            onClick={() => setClosed((s) => { const n2 = new Set(s); if (n2.has(k.path)) n2.delete(k.path); else n2.add(k.path); return n2; })}>
            {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}<Folder className="size-3.5" />{k.name}
          </button>,
          ...(open ? render(k, depth + 1) : []),
        ];
      }
      const f = k.file;
      const Icon = iconFor(f.path);
      const active = selected === f.path;
      return [
        <div key={f.id} className={cn("group flex items-center rounded", active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60")}>
          <button type="button" onClick={() => onSelect(f.path)} className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1 text-left text-xs" style={{ paddingLeft: depth * 12 + 18 }} aria-current={active ? "true" : undefined}>
            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{k.name}</span>
            {dirty.has(f.path) && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Unsaved changes" />}
            <span className="ml-auto pr-1 text-[10px] uppercase text-muted-foreground/70">{f.path.split(".").pop()}</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="mr-1 rounded p-0.5 opacity-60 hover:bg-background group-hover:opacity-100" aria-label={`Actions for ${f.path}`}><MoreHorizontal className="size-3.5" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onRename(f)}><Pencil className="size-4" />Rename</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onDownload(f)}><Download className="size-4" />Download</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onSelect={() => onDelete(f)}><Trash2 className="size-4" />Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>,
      ];
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative p-2">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files" className="h-8 pl-7 text-xs" aria-label="Search files" />
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
        {files.length === 0 ? <p className="p-3 text-xs text-muted-foreground">No files yet.</p> : render(root, 0)}
      </div>
    </div>
  );
});
