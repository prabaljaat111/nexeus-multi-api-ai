// Server-only: turns validated, structured JSON into static CSV/XLSX/DOCX/PDF bytes.
// No formulas, macros, scripts, external resources or code execution are ever produced.
import { z } from "zod";

export type ArtifactFormat = "csv" | "xlsx" | "docx" | "pdf";

const cell = z.union([z.string().max(5000), z.number().finite(), z.boolean(), z.null()]);
const columnType = z.enum(["text", "number", "currency", "percent", "date"]);

export const tabularSchema = z.object({
  title: z.string().trim().min(1).max(200),
  sheets: z.array(z.object({
    name: z.string().trim().min(1).max(60),
    columns: z.array(z.object({
      header: z.string().max(200),
      type: columnType.catch("text"),
      width: z.number().int().min(4).max(80).nullish(),
    })).min(1).max(50),
    rows: z.array(z.array(cell).max(50)).max(5000),
  })).min(1).max(10),
});

const block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), level: z.number().int().min(1).max(3).catch(2), text: z.string().max(500) }),
  z.object({ type: z.literal("paragraph"), text: z.string().max(10000) }),
  z.object({ type: z.literal("bullets"), items: z.array(z.string().max(2000)).min(1).max(200) }),
  z.object({ type: z.literal("numbered"), items: z.array(z.string().max(2000)).min(1).max(200) }),
  z.object({ type: z.literal("table"), headers: z.array(z.string().max(200)).min(1).max(12), rows: z.array(z.array(cell).max(12)).max(500) }),
]);

export const documentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().max(500).nullish(),
  blocks: z.array(block).min(1).max(600),
  footer: z.string().max(300).nullish(),
});

export type TabularDoc = z.infer<typeof tabularSchema>;
export type RichDoc = z.infer<typeof documentSchema>;
type Cell = z.infer<typeof cell>;

export const isTabular = (f: ArtifactFormat) => f === "csv" || f === "xlsx";

export function schemaPrompt(format: ArtifactFormat): string {
  if (isTabular(format)) {
    return `Return ONLY a JSON object, no prose, no markdown fences, matching:
{"title": string, "sheets": [{"name": string (<=31 chars), "columns": [{"header": string, "type": "text"|"number"|"currency"|"percent"|"date", "width": integer 8-60 or null}], "rows": [[string|number|boolean|null, ...]]}]}
Rules: each row has one value per column in order. Numbers as JSON numbers (percent as a fraction, e.g. 0.25). Dates as "YYYY-MM-DD" strings. Never write formulas. ${format === "csv" ? "Use exactly one sheet." : "Use 1-10 sheets."}`;
  }
  return `Return ONLY a JSON object, no prose, no markdown fences, matching:
{"title": string, "subtitle": string|null, "blocks": [ {"type":"heading","level":1|2|3,"text":string} | {"type":"paragraph","text":string} | {"type":"bullets","items":[string]} | {"type":"numbered","items":[string]} | {"type":"table","headers":[string],"rows":[[string|number|null]]} ], "footer": string|null}
Rules: plain text only inside strings (no markdown, HTML, links or code to execute). Write a clean, professional document.`;
}

/** Extracts the first JSON object from model output (tolerates code fences). */
export function extractJson(text: string): unknown {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error("invalid");
  return JSON.parse(text.slice(s, e + 1));
}

const FORMULA_START = /^[=+\-@\t\r]/;
/** Neutralises spreadsheet formula injection in text values. */
export function safeText(v: string): string {
  return FORMULA_START.test(v) ? `'${v}` : v;
}

function cellString(v: Cell): string {
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return String(v);
  return safeText(v);
}

export function buildCsv(doc: TabularDoc): Uint8Array {
  const sheet = doc.sheets[0]!;
  const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [sheet.columns.map((c) => esc(safeText(c.header))).join(",")];
  for (const row of sheet.rows) lines.push(sheet.columns.map((_, i) => esc(cellString(row[i] ?? null))).join(","));
  return new TextEncoder().encode("\uFEFF" + lines.join("\r\n") + "\r\n");
}

export async function buildXlsx(doc: TabularDoc): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const sheet of doc.sheets) {
    const aoa: (string | number | boolean | Date | null)[][] = [sheet.columns.map((c) => safeText(c.header))];
    for (const row of sheet.rows) {
      aoa.push(sheet.columns.map((col, i) => {
        const v = row[i] ?? null;
        if (v === null || typeof v === "boolean") return v;
        if (typeof v === "number") return v;
        if (col.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v)) { const d = new Date(`${v}T00:00:00Z`); if (!Number.isNaN(d.getTime())) return d; }
        if (col.type !== "text" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
        return safeText(v);
      }));
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    const fmt: Record<string, string> = { number: "#,##0.##", currency: "#,##0.00", percent: "0.0%", date: "yyyy-mm-dd" };
    sheet.columns.forEach((col, ci) => {
      const z = fmt[col.type];
      if (!z) return;
      for (let r = 1; r < aoa.length; r++) {
        const c = ws[XLSX.utils.encode_cell({ r, c: ci })] as { t?: string; z?: string } | undefined;
        if (c && (c.t === "n" || c.t === "d")) c.z = z;
      }
    });
    ws["!cols"] = sheet.columns.map((c) => ({ wch: c.width ?? Math.min(60, Math.max(10, c.header.length + 2)) }));
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, aoa.length - 1), c: sheet.columns.length - 1 } }) };
    let name = sheet.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Sheet";
    let n = 2;
    while (used.has(name.toLowerCase())) name = `${name.slice(0, 27)} ${n++}`;
    used.add(name.toLowerCase());
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  wb.Props = { Title: doc.title };
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx", compression: true }) as ArrayBuffer;
  return new Uint8Array(out);
}

const tableText = (v: Cell) => (v === null ? "" : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));

export async function buildDocx(doc: RichDoc): Promise<Uint8Array> {
  const d = await import("docx");
  const children: InstanceType<typeof d.Paragraph | typeof d.Table>[] = [
    new d.Paragraph({ text: doc.title, heading: d.HeadingLevel.TITLE }),
  ];
  if (doc.subtitle) children.push(new d.Paragraph({ children: [new d.TextRun({ text: doc.subtitle, italics: true, color: "666666" })], spacing: { after: 240 } }));
  const levels = [d.HeadingLevel.HEADING_1, d.HeadingLevel.HEADING_2, d.HeadingLevel.HEADING_3];
  let listInstance = 0;
  for (const b of doc.blocks) {
    if (b.type === "heading") children.push(new d.Paragraph({ text: b.text, heading: levels[b.level - 1] }));
    else if (b.type === "paragraph") children.push(new d.Paragraph({ text: b.text, spacing: { after: 160 } }));
    else if (b.type === "bullets") for (const it of b.items) children.push(new d.Paragraph({ text: it, bullet: { level: 0 } }));
    else if (b.type === "numbered") { listInstance++; for (const it of b.items) children.push(new d.Paragraph({ text: it, numbering: { reference: "num", level: 0, instance: listInstance } })); }
    else {
      const mk = (vals: string[], header: boolean) => new d.TableRow({
        tableHeader: header,
        children: b.headers.map((_, i) => new d.TableCell({
          shading: header ? { fill: "EDEDED", type: d.ShadingType.CLEAR, color: "auto" } : undefined,
          children: [new d.Paragraph({ children: [new d.TextRun({ text: vals[i] ?? "", bold: header })] })],
        })),
      });
      children.push(new d.Table({ width: { size: 100, type: d.WidthType.PERCENTAGE }, rows: [mk(b.headers, true), ...b.rows.map((r) => mk(r.map(tableText), false))] }));
      children.push(new d.Paragraph({ text: "" }));
    }
  }
  const document = new d.Document({
    title: doc.title,
    creator: "Unified AI Workspace",
    numbering: { config: [{ reference: "num", levels: [{ level: 0, format: d.LevelFormat.DECIMAL, text: "%1.", alignment: d.AlignmentType.START }] }] },
    sections: [{
      properties: {},
      footers: doc.footer ? { default: new d.Footer({ children: [new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [new d.TextRun({ text: doc.footer, size: 18, color: "777777" })] })] }) } : undefined,
      children,
    }],
  });
  const buf = await d.Packer.toArrayBuffer(document);
  return new Uint8Array(buf);
}

export async function buildPdf(doc: RichDoc): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.title);
  pdf.setCreator("Unified AI Workspace");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 56, CW = W - M * 2;
  // Standard fonts are WinAnsi only; replace anything they can't encode.
  const clean = (s: string) => s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/\u2026/g, "...")
    .replace(/\t/g, "  ").replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "?");
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const ensure = (h: number) => { if (y - h < M + 20) { page = pdf.addPage([W, H]); y = H - M; } };
  const wrap = (text: string, font: typeof regular, size: number, width: number) => {
    const out: string[] = [];
    for (const para of clean(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        if (!word) continue;
        const t = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(t, size) <= width) { line = t; continue; }
        if (line) out.push(line);
        let w = word;
        while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
          let k = w.length; while (k > 1 && font.widthOfTextAtSize(w.slice(0, k), size) > width) k--;
          out.push(w.slice(0, k)); w = w.slice(k);
        }
        line = w;
      }
      out.push(line);
    }
    return out;
  };
  const text = (s: string, size: number, font = regular, indent = 0, gap = 4, color = rgb(0.12, 0.12, 0.12)) => {
    for (const l of wrap(s, font, size, CW - indent)) { ensure(size + gap); y -= size + gap; page.drawText(l, { x: M + indent, y, size, font, color }); }
  };
  text(doc.title, 22, bold, 0, 6);
  if (doc.subtitle) text(doc.subtitle, 11, regular, 0, 4, rgb(0.4, 0.4, 0.4));
  y -= 10;
  for (const b of doc.blocks) {
    if (b.type === "heading") { y -= 8; text(b.text, [16, 13.5, 12][b.level - 1]!, bold, 0, 5); y -= 2; }
    else if (b.type === "paragraph") { text(b.text, 10.5, regular, 0, 4.5); y -= 6; }
    else if (b.type === "bullets" || b.type === "numbered") {
      b.items.forEach((it, i) => {
        const lines = wrap(it, regular, 10.5, CW - 18);
        lines.forEach((l, j) => { ensure(15); y -= 15; if (j === 0) page.drawText(b.type === "bullets" ? "-" : `${i + 1}.`, { x: M + 2, y, size: 10.5, font: regular }); page.drawText(l, { x: M + 18, y, size: 10.5, font: regular }); });
      });
      y -= 6;
    } else {
      const cols = b.headers.length, colW = CW / cols, size = cols > 6 ? 8 : 9;
      const row = (vals: string[], font: typeof regular, shade: boolean) => {
        const cells = b.headers.map((_, i) => wrap(vals[i] ?? "", font, size, colW - 8));
        const h = Math.max(...cells.map((c) => c.length)) * (size + 3) + 8;
        ensure(h);
        if (shade) page.drawRectangle({ x: M, y: y - h, width: CW, height: h, color: rgb(0.93, 0.93, 0.93) });
        page.drawLine({ start: { x: M, y: y - h }, end: { x: M + CW, y: y - h }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
        cells.forEach((c, i) => c.forEach((l, j) => page.drawText(l, { x: M + i * colW + 4, y: y - 4 - (j + 1) * (size + 3) + 3, size, font })));
        y -= h;
      };
      row(b.headers, bold, true);
      for (const r of b.rows) row(r.map(tableText), regular, false);
      y -= 12;
    }
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const label = clean(`${doc.footer ? `${doc.footer}  ·  ` : ""}Page ${i + 1} of ${pages.length}`).replace("·", "-");
    p.drawText(label, { x: M, y: M / 2, size: 8, font: regular, color: rgb(0.5, 0.5, 0.5) });
  });
  return pdf.save({ useObjectStreams: true });
}

export function summarize(format: ArtifactFormat, data: TabularDoc | RichDoc) {
  if ("sheets" in data) {
    return { title: data.title, sheets: data.sheets.map((s) => ({ name: s.name, columns: s.columns.map((c) => c.header).slice(0, 12), rowCount: s.rows.length })), format };
  }
  return { title: data.title, format, sections: data.blocks.filter((b) => b.type === "heading").length, blocks: data.blocks.length };
}
