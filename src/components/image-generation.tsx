import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Download, ImageIcon, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { notify } from "@/lib/toast";
import type { AttachmentRow } from "@/lib/attachments";
import type { ImageModel } from "@/lib/chats";
import { cancelImageJob, generateImageJob } from "@/lib/images.functions";
import { deleteAttachment } from "@/lib/attachments.functions";
import { useAttachmentUrl } from "@/components/attachments";

export interface ImageOptions {
  modelId: string; prompt: string; size?: string; aspectRatio?: string; quality?: string; style?: string; negativePrompt?: string;
}

export interface ImageJobRow {
  id: string; message_id: string | null; prompt: string; model_id: string | null; size: string | null; aspect_ratio: string | null;
  quality: string | null; style: string | null; negative_prompt: string | null; status: string;
}

export async function listImageJobs(chatId: string): Promise<ImageJobRow[]> {
  const { data, error } = await supabase.from("image_generation_jobs")
    .select("id, message_id, prompt, model_id, size, aspect_ratio, quality, style, negative_prompt, status")
    .eq("chat_id", chatId).order("created_at");
  if (error) throw new Error("Couldn't load image jobs.");
  return data;
}

export function jobToOptions(j: ImageJobRow): Partial<ImageOptions> {
  const o: Partial<ImageOptions> = { prompt: j.prompt };
  if (j.model_id) o.modelId = j.model_id;
  if (j.size) o.size = j.size;
  if (j.aspect_ratio) o.aspectRatio = j.aspect_ratio;
  if (j.quality) o.quality = j.quality;
  if (j.style) o.style = j.style;
  if (j.negative_prompt) o.negativePrompt = j.negative_prompt;
  return o;
}

export function useImageGeneration(chatId: string, onSettled: () => void) {
  const gen = useServerFn(generateImageJob);
  const cancelFn = useServerFn(cancelImageJob);
  const [pending, setPending] = useState<{ jobId: string; prompt: string; cancelling: boolean } | null>(null);
  const [failed, setFailed] = useState<{ message: string; options: ImageOptions } | null>(null);
  useEffect(() => { setFailed(null); }, [chatId]);
  useEffect(() => { setPending(null); }, [chatId]);

  const generate = useCallback(async (o: ImageOptions) => {
    if (pending) return;
    setFailed(null);
    const jobId = crypto.randomUUID();
    setPending({ jobId, prompt: o.prompt, cancelling: false });
    setTimeout(onSettled, 400); // show the saved prompt message promptly
    try {
      await gen({ data: { jobId, chatId, ...o } });
      notify.success("Image generated");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Image generation failed.";
      if (msg.includes("cancelled")) notify.success("Image generation cancelled"); else { const m = msg.startsWith("[") ? "Please check the image options." : msg; notify.error(m); setFailed({ message: m, options: o }); }
    } finally {
      setPending(null);
      onSettled();
    }
  }, [pending, gen, chatId, onSettled]);

  const cancel = useCallback(async () => {
    if (!pending) return;
    setPending({ ...pending, cancelling: true });
    try { await cancelFn({ data: { jobId: pending.jobId } }); } catch (e) { notify.fromError(e); }
  }, [pending, cancelFn]);

  return { pending, generate, cancel, failed, dismissFailure: () => setFailed(null) };
}

const label = (v: string) => v.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function OptionSelect({ id, labelText, value, options, onChange }: { id: string; labelText: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{labelText}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__default">Provider default</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{label(o)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ImageDialog({ open, onOpenChange, models, initial, onSubmit }: {
  open: boolean; onOpenChange: (o: boolean) => void; models: ImageModel[] | undefined; initial: Partial<ImageOptions> | null;
  onSubmit: (o: ImageOptions) => void;
}) {
  const [modelId, setModelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("__default");
  const [ratio, setRatio] = useState("__default");
  const [quality, setQuality] = useState("__default");
  const [style, setStyle] = useState("__default");
  const [negative, setNegative] = useState("");

  useEffect(() => {
    if (!open) return;
    const firstId = models?.[0]?.id ?? "";
    setModelId(initial?.modelId && models?.some((m) => m.id === initial.modelId) ? initial.modelId : firstId);
    setPrompt(initial?.prompt ?? "");
    setSize(initial?.size ?? "__default"); setRatio(initial?.aspectRatio ?? "__default");
    setQuality(initial?.quality ?? "__default"); setStyle(initial?.style ?? "__default"); setNegative(initial?.negativePrompt ?? "");
  }, [open, initial, models]);

  const model = models?.find((m) => m.id === modelId);
  const caps = model?.caps;
  const pick = (v: string, list?: string[]) => (v !== "__default" && list?.includes(v) ? v : undefined);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = prompt.trim();
    if (!model || !p) return;
    const o: ImageOptions = { modelId: model.id, prompt: p.slice(0, 4000) };
    const s = pick(size, caps?.supported_sizes); if (s) o.size = s;
    const r = pick(ratio, caps?.supported_aspect_ratios); if (r) o.aspectRatio = r;
    const q = pick(quality, caps?.supported_qualities); if (q) o.quality = q;
    const st = pick(style, caps?.supported_styles); if (st) o.style = st;
    if (caps?.supports_negative_prompt && negative.trim()) o.negativePrompt = negative.trim().slice(0, 2000);
    onSubmit(o);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ImageIcon className="size-5" />Generate image</DialogTitle>
            <DialogDescription>Images are created by the selected provider and may be subject to its content policies.</DialogDescription>
          </DialogHeader>
          {!models?.length ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No image models available. Add an OpenAI, Stability AI or FLUX connection in Settings → Connections and fetch its models.
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="img-model">Image model</Label>
                <Select value={modelId} onValueChange={setModelId}>
                  <SelectTrigger id="img-model"><SelectValue placeholder="Choose a model" /></SelectTrigger>
                  <SelectContent>{models.map((m) => <SelectItem key={m.id} value={m.id}>{m.display_name} · {m.connection_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="img-prompt">Prompt</Label>
                <Textarea id="img-prompt" autoFocus rows={4} maxLength={4000} required value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the image you want…" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {caps?.supported_sizes?.length ? <OptionSelect id="img-size" labelText="Size" value={size} options={caps.supported_sizes} onChange={setSize} /> : null}
                {caps?.supported_aspect_ratios?.length ? <OptionSelect id="img-ratio" labelText="Aspect ratio" value={ratio} options={caps.supported_aspect_ratios} onChange={setRatio} /> : null}
                {caps?.supported_qualities?.length ? <OptionSelect id="img-quality" labelText="Quality" value={quality} options={caps.supported_qualities} onChange={setQuality} /> : null}
                {caps?.supported_styles?.length ? <OptionSelect id="img-style" labelText="Style" value={style} options={caps.supported_styles} onChange={setStyle} /> : null}
              </div>
              {caps?.supports_negative_prompt && (
                <div className="space-y-1.5">
                  <Label htmlFor="img-neg">Negative prompt (optional)</Label>
                  <Textarea id="img-neg" rows={2} maxLength={2000} value={negative} onChange={(e) => setNegative(e.target.value)} placeholder="Things to avoid" />
                </div>
              )}
            </>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!model || !prompt.trim()}>Generate</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ImageProgress({ prompt, cancelling, onCancel }: { prompt: string; cancelling: boolean; onCancel: () => void }) {
  return (
    <div className="flex justify-start" aria-live="polite">
      <div className="flex w-full max-w-sm items-center gap-3 rounded-lg border bg-card p-3 text-sm">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-muted"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{cancelling ? "Cancelling…" : "Generating image…"}</div>
          <div className="truncate text-xs text-muted-foreground" title={prompt}>{prompt}</div>
        </div>
        <Button type="button" size="icon" variant="ghost" aria-label="Cancel image generation" disabled={cancelling} onClick={onCancel}><X className="size-4" /></Button>
      </div>
    </div>
  );
}

export function GeneratedImageCard({ a, job, canRegenerate, onRegenerate, onDeleted }: {
  a: AttachmentRow; job: ImageJobRow | undefined; canRegenerate: boolean; onRegenerate: (j: ImageJobRow) => void; onDeleted: () => void;
}) {
  const getUrl = useAttachmentUrl();
  const delFn = useServerFn(deleteAttachment);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    getUrl(a.id, false).then((u) => { if (live) setUrl(u); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [a.id, getUrl]);

  async function download() {
    try { const u = await getUrl(a.id, true); const el = document.createElement("a"); el.href = u; el.rel = "noopener"; el.click(); } catch (e) { notify.fromError(e); }
  }

  return (
    <figure className="w-full max-w-md overflow-hidden rounded-lg border bg-card">
      <div className="flex aspect-square max-h-[28rem] w-full items-center justify-center bg-muted">
        {url ? <img src={url} alt={job?.prompt ?? "Generated image"} className="h-full w-full object-contain" referrerPolicy="no-referrer" />
          : failed ? <span className="text-xs text-muted-foreground">Image unavailable</span>
          : <Loader2 className="size-5 animate-spin text-muted-foreground" />}
      </div>
      {job && <figcaption className="line-clamp-3 border-t px-3 py-2 text-xs text-muted-foreground">{job.prompt}</figcaption>}
      <div className="flex flex-wrap gap-1 border-t p-1.5">
        <Button type="button" size="sm" variant="ghost" onClick={() => void download()}><Download className="size-4" />Download</Button>
        {job && (
          <Button type="button" size="sm" variant="ghost" onClick={() => {
            navigator.clipboard.writeText(job.prompt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => notify.error("Couldn't copy."));
          }}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy prompt"}</Button>
        )}
        {job && canRegenerate && <Button type="button" size="sm" variant="ghost" onClick={() => onRegenerate(job)}><RefreshCw className="size-4" />Variation</Button>}
        <ConfirmDialog title="Delete this image?" description="The generated image will be permanently deleted." confirmLabel="Delete" destructive
          onConfirm={async () => { try { await delFn({ data: { id: a.id } }); notify.success("Image deleted"); onDeleted(); } catch (e) { notify.fromError(e); } }}
          trigger={<Button type="button" size="sm" variant="ghost" className="text-destructive"><Trash2 className="size-4" />Delete</Button>} />
      </div>
    </figure>
  );
}
