import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { codeKeys } from "@/lib/code-projects";
import { createCodeProject } from "@/lib/code-projects.functions";
import { notify } from "@/lib/toast";

export function NewProjectDialog({ chatId, modelId, trigger }: { chatId?: string | null; modelId?: string | null; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [framework, setFramework] = useState<"react_vite" | "static_html">("react_vite");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const create = useServerFn(createCodeProject);
  const m = useMutation({
    mutationFn: () => create({ data: { title: title.trim() || "Untitled project", framework, chatId: chatId ?? null, modelId: modelId ?? null } }),
    onSuccess: ({ id }) => { setOpen(false); void qc.invalidateQueries({ queryKey: codeKeys.projects }); void navigate({ to: "/build/$projectId", params: { projectId: id } }); },
    onError: (e) => notify.fromError(e),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New coding project</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="ptitle">Name</Label><Input id="ptitle" value={title} maxLength={80} placeholder="Portfolio site" onChange={(e) => setTitle(e.target.value)} /></div>
          <RadioGroup value={framework} onValueChange={(v) => setFramework(v as typeof framework)} className="grid gap-2">
            <Label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-primary">
              <RadioGroupItem value="react_vite" className="mt-0.5" /><span><span className="block text-sm font-medium">React + Vite</span><span className="text-xs text-muted-foreground">Components, state and npm packages from a CDN.</span></span>
            </Label>
            <Label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-primary">
              <RadioGroupItem value="static_html" className="mt-0.5" /><span><span className="block text-sm font-medium">Static HTML</span><span className="text-xs text-muted-foreground">Plain HTML, CSS and JavaScript.</span></span>
            </Label>
          </RadioGroup>
          <p className="text-xs text-muted-foreground">Live preview runs in your browser for frontend code only. Backends, databases and servers are not run.</p>
        </div>
        <DialogFooter><Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Creating…" : "Create project"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

