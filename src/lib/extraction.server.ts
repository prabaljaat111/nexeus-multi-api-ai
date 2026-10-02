// Server-only, safe text extraction for supported attachment formats.
// Nothing here executes file content: no macros, scripts, formulas, HTML rendering or OCR.

export type ExtractKind = "text" | "markdown" | "csv" | "json" | "pdf" | "docx" | "xlsx";

export interface Segment { label: string; start: number; end: number }
export interface ExtractResult {
  status: "complete" | "unsupported" | "failed";
  text: string;
  segments: Segment[];
  metadata: Record<string, unknown>;
  error?: string;
}

export const MAX_EXTRACT_INPUT_BYTES = 20 * 1024 * 1024; // larger files stay download-only
export const MAX_EXTRACTED_CHARS = 400_000;
const MAX_PDF_PAGES = 300;
const MAX_SHEET_ROWS = 5000;
const ROWS_PER_SEGMENT = 100;
const MAX_UNZIPPED_BYTES = 40 * 1024 * 1024;

export const UNSUPPORTED_MESSAGE = "File uploaded successfully, but AI analysis is not available for this format.";

const ext = (name: string) => (name.toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1] ?? "");

/** Decides by extension AND mime; anything not on this allow-list is download-only. */
export function extractKind(filename: string, mime: string | null): ExtractKind | null {
  const e = ext(filename);
  const m = (mime ?? "").toLowerCase();
  if (e === "txt" || e === "log" || m === "text/plain") return "text";
  if (e === "md" || e === "markdown" || m === "text/markdown") return "markdown";
  if (e === "csv" || m === "text/csv") return "csv";
  if (e === "json" || m === "application/json") return "json";
  if (e === "pdf" || m === "application/pdf") return "pdf";
  if (e === "docx" || m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (e === "xlsx" || m === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  return null;
}

class Builder {
  text = "";
  segments: Segment[] = [];
  truncated = false;
  add(label: string, body: string) {
    if (this.truncated || !body.trim()) return;
    let chunk = body.trim() + "\n\n";
    const room = MAX_EXTRACTED_CHARS - this.text.length;
    if (room <= 0) { this.truncated = true; return; }
    if (chunk.length > room) { chunk = chunk.slice(0, room); this.truncated = true; }
    const start = this.text.length;
    this.text += chunk;
    const last = this.segments[this.segments.length - 1];
    if (last && last.label === label && last.end === start) last.end = this.text.length;
    else this.segments.push({ label, start, end: this.text.length });
  }
}

const decode = (b: Uint8Array) => new TextDecoder("utf-8", { fatal: false }).decode(b).replace(/\u0000/g, "");

function lineChunks(b: Builder, text: string, perChunk = 80) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length && !b.truncated; i += perChunk) {
    const end = Math.min(lines.length, i + perChunk);
    b.add(`lines ${i + 1}–${end}`, lines.slice(i, end).join("\n"));
  }
  return lines.length;
}

async function rowsFromSheet(b: Builder, rows: string[][], sheetLabel: string | null) {
  // rows[0] is the header; repeat it at the top of each segment so excerpts stay readable.
  const header = rows[0] ?? [];
  const fmt = (r: string[]) => r.map((c) => c.replace(/[\r\n]+/g, " ")).join(" | ");
  for (let i = 1; i < rows.length && !b.truncated; i += ROWS_PER_SEGMENT) {
    const end = Math.min(rows.length, i + ROWS_PER_SEGMENT);
    // Spreadsheet row numbers: header is row 1.
    const label = `${sheetLabel ? `Sheet “${sheetLabel}”, ` : ""}rows ${i + 1}–${end}`;
    b.add(label, [fmt(header), ...rows.slice(i, end).map(fmt)].join("\n"));
  }
  if (rows.length === 1) b.add(`${sheetLabel ? `Sheet “${sheetLabel}”, ` : ""}row 1`, fmt(header));
}

async function sheetsFromWorkbook(bytes: Uint8Array, csv: boolean, b: Builder) {
  const XLSX = await import("xlsx");
  const wb = csv
    ? XLSX.read(decode(bytes), { type: "string", raw: true, sheetRows: MAX_SHEET_ROWS + 1, dense: true })
    : XLSX.read(bytes, { type: "array", cellFormula: false, cellHTML: false, bookVBA: false, sheetRows: MAX_SHEET_ROWS + 1, dense: true });
  const sheets: { name: string; rows: number; columns: number }[] = [];
  let rowCapped = false;
  for (const name of wb.SheetNames.slice(0, 30)) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "", blankrows: false })
      .map((r) => r.map((c) => String(c ?? "")));
    if (rows.length > MAX_SHEET_ROWS) rowCapped = true;
    sheets.push({ name, rows: rows.length, columns: Math.max(0, ...rows.slice(0, 50).map((r) => r.length)) });
    await rowsFromSheet(b, rows.slice(0, MAX_SHEET_ROWS), csv ? null : name);
  }
  return { sheets, rowCapped };
}

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unxml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
  if (e[0] === "#") { const n = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; }
  return XML_ENTITIES[e.toLowerCase()] ?? "";
});
const paraText = (xml: string) => unxml(
  xml.replace(/<w:tab\/>/g, "\t").replace(/<w:br[^>]*\/>/g, "\n")
    .match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>|\t|\n/g)?.map((t) => t.replace(/<[^>]+>/g, "")).join("") ?? "",
);

async function docx(bytes: Uint8Array, b: Builder) {
  const { unzipSync } = await import("fflate");
  let total = 0;
  const files = unzipSync(bytes, {
    filter: (f) => {
      if (f.name !== "word/document.xml" && f.name !== "word/footnotes.xml") return false;
      total += f.originalSize;
      if (total > MAX_UNZIPPED_BYTES) throw new Error("too_large");
      return true;
    },
  });
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("not_docx");
  const body = decode(xml);
  let section = "Start";
  let headings = 0, tables = 0, paragraphs = 0;
  let buf: string[] = [];
  const flush = () => { if (buf.length) { b.add(`section “${section}”`, buf.join("\n")); buf = []; } };
  for (const m of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g)) {
    const block = m[0];
    if (block.startsWith("<w:tbl")) {
      tables++;
      const rows = [...block.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map((r) =>
        [...r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((c) => paraText(c[0]).replace(/\s+/g, " ").trim()).join(" | "));
      flush();
      b.add(`section “${section}”, table ${tables}`, rows.join("\n"));
      continue;
    }
    const text = paraText(block).trim();
    if (!text) continue;
    paragraphs++;
    const style = block.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "";
    if (/^(Heading\d|Title)$/i.test(style)) {
      flush();
      headings++;
      section = text.slice(0, 80);
      buf.push(`# ${text}`);
    } else {
      const list = /<w:numPr>/.test(block);
      buf.push(list ? `- ${text}` : text);
    }
  }
  flush();
  return { headings, tables, paragraphs };
}

async function pdf(bytes: Uint8Array, b: Builder) {
  const { getDocumentProxy, extractText } = await import("unpdf");
  const doc = await getDocumentProxy(bytes, { disableFontFace: true, useSystemFonts: false });
  const pages = doc.numPages;
  const { text } = await extractText(doc, { mergePages: false });
  const list = (Array.isArray(text) ? text : [text]).slice(0, MAX_PDF_PAGES);
  let chars = 0;
  list.forEach((t, i) => { const clean = t.replace(/\s+\n/g, "\n").trim(); chars += clean.length; b.add(`page ${i + 1}`, clean); });
  return { pages, pagesRead: list.length, textChars: chars };
}

export async function extract(bytes: Uint8Array, filename: string, mime: string | null): Promise<ExtractResult> {
  const kind = extractKind(filename, mime);
  if (!kind) return { status: "unsupported", text: "", segments: [], metadata: {}, error: UNSUPPORTED_MESSAGE };
  if (bytes.length > MAX_EXTRACT_INPUT_BYTES) {
    return { status: "unsupported", text: "", segments: [], metadata: { kind }, error: "This file is too large for AI analysis (limit 20 MB). It's still available to download." };
  }
  const b = new Builder();
  const metadata: Record<string, unknown> = { kind };
  try {
    if (kind === "text" || kind === "markdown") metadata["lines"] = lineChunks(b, decode(bytes));
    else if (kind === "json") {
      const raw = decode(bytes);
      let pretty = raw;
      try { pretty = JSON.stringify(JSON.parse(raw), null, 2); metadata["valid_json"] = true; } catch { metadata["valid_json"] = false; }
      metadata["lines"] = lineChunks(b, pretty);
    } else if (kind === "csv" || kind === "xlsx") {
      const r = await sheetsFromWorkbook(bytes, kind === "csv", b);
      metadata["sheets"] = r.sheets;
      if (r.rowCapped) metadata["row_limit"] = MAX_SHEET_ROWS;
    } else if (kind === "docx") Object.assign(metadata, await docx(bytes, b));
    else {
      const r = await pdf(bytes, b);
      Object.assign(metadata, r);
      if (r.textChars < Math.max(40, r.pagesRead * 20)) {
        return { status: "unsupported", text: "", segments: [], metadata: { ...metadata, scanned: true },
          error: "This PDF has no extractable text (it may be scanned). AI analysis isn't available for it." };
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/password|encrypt/i.test(msg) || (e as { name?: string })?.name === "PasswordException") {
      return { status: "failed", text: "", segments: [], metadata, error: "This file is password-protected, so it can't be analyzed." };
    }
    if (msg === "too_large") return { status: "failed", text: "", segments: [], metadata, error: "This file expands too much to analyze safely." };
    return { status: "failed", text: "", segments: [], metadata, error: "This file couldn't be read. It may be damaged or in an unexpected format." };
  }
  if (!b.text.trim()) return { status: "unsupported", text: "", segments: [], metadata, error: "No readable text was found in this file." };
  metadata["chars"] = b.text.length;
  if (b.truncated) metadata["truncated"] = true;
  return { status: "complete", text: b.text, segments: b.segments, metadata };
}

/** Picks bounded excerpts (whole segments, in order) within a character budget. */
export function excerpt(text: string, segments: Segment[], budget: number) {
  const parts: { label: string; body: string }[] = [];
  let used = 0;
  let truncated = false;
  for (const s of segments) {
    const body = text.slice(s.start, s.end);
    if (used + body.length > budget) {
      const room = budget - used;
      if (room > 500) { parts.push({ label: s.label, body: body.slice(0, room) }); used += room; }
      truncated = true;
      break;
    }
    parts.push({ label: s.label, body });
    used += body.length;
  }
  return { parts, truncated };
}
