import { memo, useMemo } from "react";
import { diffLines } from "diff";
import { cn } from "@/lib/utils";

interface Row { kind: "add" | "del" | "ctx" | "gap"; text: string; a: number | null; b: number | null }

function buildRows(before: string, after: string): { rows: Row[]; added: number; removed: number } {
  const parts = diffLines(before, after);
  const rows: Row[] = [];
  let a = 1, b = 1, added = 0, removed = 0;
  parts.forEach((p, idx) => {
    const lines = p.value.replace(/\n$/, "").split("\n");
    if (p.added) { lines.forEach((t) => rows.push({ kind: "add", text: t, a: null, b: b++ })); added += lines.length; }
    else if (p.removed) { lines.forEach((t) => rows.push({ kind: "del", text: t, a: a++, b: null })); removed += lines.length; }
    else {
      const ctx = 3;
      const first = idx === 0, last = idx === parts.length - 1;
      if (lines.length > ctx * 2 + 1) {
        const head = first ? [] : lines.slice(0, ctx);
        const tail = last ? [] : lines.slice(-ctx);
        head.forEach((t) => rows.push({ kind: "ctx", text: t, a: a++, b: b++ }));
        const skipped = lines.length - head.length - tail.length;
        rows.push({ kind: "gap", text: `${skipped} unchanged line${skipped === 1 ? "" : "s"}`, a: null, b: null });
        a += skipped; b += skipped;
        tail.forEach((t) => rows.push({ kind: "ctx", text: t, a: a++, b: b++ }));
      } else lines.forEach((t) => rows.push({ kind: "ctx", text: t, a: a++, b: b++ }));
    }
  });
  return { rows, added, removed };
}

export const DiffView = memo(function DiffView({ before, after, className }: { before: string; after: string; className?: string }) {
  const { rows, added, removed } = useMemo(() => buildRows(before, after), [before, after]);
  return (
    <div className={cn("overflow-hidden rounded-md border bg-card", className)}>
      <div className="flex gap-3 border-b px-3 py-1.5 text-xs text-muted-foreground">
        <span className="text-success">+{added}</span><span className="text-destructive">−{removed}</span>
      </div>
      <div className="max-h-[60vh] overflow-auto font-mono text-[12px] leading-5">
        <table className="w-full border-collapse">
          <tbody>
            {rows.map((r, i) => r.kind === "gap" ? (
              <tr key={i}><td colSpan={3} className="bg-muted/50 px-3 py-0.5 text-center text-[11px] text-muted-foreground">{r.text}</td></tr>
            ) : (
              <tr key={i} className={r.kind === "add" ? "bg-success/10" : r.kind === "del" ? "bg-destructive/10" : undefined}>
                <td className="w-10 select-none px-2 text-right text-muted-foreground/70">{r.a ?? ""}</td>
                <td className="w-10 select-none px-2 text-right text-muted-foreground/70">{r.b ?? ""}</td>
                <td className="whitespace-pre px-2">
                  <span className={cn("mr-2 select-none", r.kind === "add" ? "text-success" : r.kind === "del" ? "text-destructive" : "text-muted-foreground/50")}>{r.kind === "add" ? "+" : r.kind === "del" ? "−" : " "}</span>{r.text}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
