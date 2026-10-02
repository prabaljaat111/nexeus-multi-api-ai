import { useCallback, useEffect, useRef, useState } from "react";
import { Monitor, RefreshCw, Smartphone, Tablet, Maximize2, Minimize2, ServerOff, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LoadingState } from "@/components/states";
import { cn } from "@/lib/utils";
import type { Framework } from "@/lib/code-shared";
import type { PreviewBuild } from "./preview-builder";

export interface ConsoleEntry { level: "log" | "info" | "warn" | "error"; text: string; at: number }

const WIDTHS = { desktop: "100%", tablet: "820px", mobile: "390px" } as const;

export function PreviewPane({ framework, files, buildKey, onConsole, fullscreen, onToggleFullscreen }: {
  framework: Framework; files: { path: string; content: string }[]; buildKey: number;
  onConsole: (e: ConsoleEntry) => void; fullscreen: boolean; onToggleFullscreen: () => void;
}) {
  const [build, setBuild] = useState<PreviewBuild | null>(null);
  const [viewport, setViewport] = useState<keyof typeof WIDTHS>("desktop");
  const [nonce, setNonce] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  useEffect(() => {
    let cancelled = false;
    setBuild(null);
    void import("./preview-builder").then((m) => m.buildPreview(framework, filesRef.current)).then((b) => { if (!cancelled) setBuild(b); })
      .catch(() => { if (!cancelled) setBuild({ ok: false, unsupported: false, message: "The preview couldn't be built." }); });
    return () => { cancelled = true; };
  }, [framework, buildKey]);

  const onMessage = useCallback((e: MessageEvent) => {
    // Only accept messages from our own sandboxed frame.
    if (!frame.current || e.source !== frame.current.contentWindow) return;
    const d = e.data as { __uawPreview?: number; level?: string; text?: string } | null;
    if (!d || d.__uawPreview !== 1 || typeof d.text !== "string") return;
    const level = d.level === "error" || d.level === "warn" || d.level === "info" ? d.level : "log";
    onConsole({ level, text: d.text.slice(0, 2000), at: Date.now() });
  }, [onConsole]);

  useEffect(() => {
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onMessage]);

  useEffect(() => {
    if (build && !build.ok) onConsole({ level: "error", text: build.message, at: Date.now() });
  }, [build, onConsole]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b px-2 py-1">
        <ToggleGroup type="single" size="sm" value={viewport} onValueChange={(v) => v && setViewport(v as keyof typeof WIDTHS)} aria-label="Preview size">
          <ToggleGroupItem value="desktop" aria-label="Desktop"><Monitor className="size-3.5" /></ToggleGroupItem>
          <ToggleGroupItem value="tablet" aria-label="Tablet"><Tablet className="size-3.5" /></ToggleGroupItem>
          <ToggleGroupItem value="mobile" aria-label="Mobile"><Smartphone className="size-3.5" /></ToggleGroupItem>
        </ToggleGroup>
        <span className="ml-1 hidden truncate text-[11px] text-muted-foreground sm:inline">Sandboxed · no access to your account</span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" className="size-7" aria-label="Refresh preview" onClick={() => setNonce((n) => n + 1)}><RefreshCw className="size-3.5" /></Button>
          <Button size="icon" variant="ghost" className="size-7" aria-label={fullscreen ? "Exit focused preview" : "Focused preview"} onClick={onToggleFullscreen}>
            {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-muted/40 p-0 sm:p-2">
        {!build ? <LoadingState label="Building preview…" /> : !build.ok ? (
          <div className="m-auto max-w-md p-6 text-center">
            {build.unsupported ? <ServerOff className="mx-auto mb-3 size-8 text-muted-foreground" /> : <AlertTriangle className="mx-auto mb-3 size-8 text-destructive" />}
            <p className="text-sm font-medium">{build.unsupported ? "This project’s code is saved, but live preview is only available for supported frontend projects." : "Preview couldn’t start"}</p>
            <p className="mt-2 text-xs text-muted-foreground">{build.message}</p>
          </div>
        ) : (
          <iframe key={`${buildKey}-${nonce}`} ref={frame} title="Project preview" srcDoc={build.html}
            sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer"
            allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-write 'none'; payment 'none'; usb 'none'"
            className={cn("h-full border-0 bg-white shadow-sm transition-[width] sm:rounded-md", viewport === "desktop" ? "w-full" : "")}
            style={{ width: WIDTHS[viewport], maxWidth: "100%" }} />
        )}
      </div>
    </div>
  );
}
