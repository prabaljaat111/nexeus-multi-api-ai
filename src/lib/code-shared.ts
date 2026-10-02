// Client-safe shared rules for the AI Coding Workspace (used by browser UI and server handlers).

export type Framework = "static_html" | "react_vite";
export type FileType = "source" | "config" | "style" | "asset_reference";

export const CODE_LIMITS = {
  maxFileBytes: 200_000,
  maxProjectBytes: 2_000_000,
  maxFiles: 200,
  maxPathLength: 200,
  maxDepth: 8,
} as const;

const ALLOWED_EXT = new Set(["html", "css", "js", "jsx", "ts", "tsx", "json", "md", "svg"]);
const BLOCKED_NAMES = new Set(["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock"]);

/** Normalizes a project path or returns an error message. Never trusts the caller. */
export function normalizeProjectPath(raw: string): { ok: true; path: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Invalid path." };
  const p = raw.trim().replace(/^\.\//, "");
  if (!p) return { ok: false, error: "Path is required." };
  if (p.length > CODE_LIMITS.maxPathLength) return { ok: false, error: "Path is too long." };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(p)) return { ok: false, error: "Path contains invalid characters." };
  if (p.startsWith("/") || p.startsWith("~") || /^[a-zA-Z]:/.test(p)) return { ok: false, error: "Absolute paths are not allowed." };
  if (p.includes("%")) return { ok: false, error: "Encoded paths are not allowed." };
  const parts = p.split("/");
  if (parts.length > CODE_LIMITS.maxDepth) return { ok: false, error: "Folders are nested too deeply." };
  for (const seg of parts) {
    if (!seg || seg === "." || seg === "..") return { ok: false, error: "Path traversal is not allowed." };
    if (seg.startsWith(".")) return { ok: false, error: "Hidden files (like .env) are not allowed." };
    if (!/^[A-Za-z0-9_\-.@]+$/.test(seg)) return { ok: false, error: "Use only letters, numbers, dashes, underscores and dots in paths." };
    if (seg === "node_modules") return { ok: false, error: "node_modules can't be stored." };
  }
  const name = parts[parts.length - 1]!;
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (!ALLOWED_EXT.has(ext)) return { ok: false, error: `File type “.${ext || "?"}” isn't allowed. Allowed: ${[...ALLOWED_EXT].join(", ")}.` };
  if (BLOCKED_NAMES.has(name.toLowerCase())) return { ok: false, error: "Lock files can't be edited here." };
  if (/(^|[-_.])(env|secrets?|credentials?)([-_.]|$)/i.test(name.replace(/\.(json|js|ts|md)$/i, ""))) return { ok: false, error: "Files meant for secrets or credentials aren't allowed." };
  return { ok: true, path: parts.join("/") };
}

const SECRET_PATTERNS: RegExp[] = [
  /sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{10,}/,
  /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'`][^"'`\s]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /AIza[0-9A-Za-z_-]{35}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /xox[abpr]-[A-Za-z0-9-]{10,}/,
];

export function containsSecret(content: string): boolean {
  return SECRET_PATTERNS.some((r) => r.test(content));
}

export function redactSecrets(text: string): string {
  let out = text;
  for (const r of SECRET_PATTERNS) out = out.replace(new RegExp(r.source, "g"), "[redacted]");
  return out;
}

export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

export function languageFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return ({ ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", json: "json", css: "css", html: "html", md: "markdown", svg: "svg" } as Record<string, string>)[ext] ?? "text";
}

export function fileTypeFor(path: string): FileType {
  const name = path.split("/").pop() ?? "";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "css") return "style";
  if (ext === "svg") return "asset_reference";
  if (ext === "json" || /^(vite|tsconfig|postcss|tailwind)\b/.test(name)) return "config";
  return "source";
}

export function isEntryPath(path: string, framework: Framework): boolean {
  if (path === "index.html") return true;
  return framework === "react_vite" && /^src\/main\.(t|j)sx?$/.test(path);
}

/** Validates a full file write (path + content). Returns normalized path or error. */
export function validateWrite(path: string, content: string): { ok: true; path: string } | { ok: false; error: string } {
  const n = normalizeProjectPath(path);
  if (!n.ok) return n;
  if (byteLength(content) > CODE_LIMITS.maxFileBytes) return { ok: false, error: `${n.path} is larger than ${CODE_LIMITS.maxFileBytes / 1000} KB.` };
  if (containsSecret(content)) return { ok: false, error: `${n.path} looks like it contains a secret key, so it was not saved.` };
  return n;
}

// ---------------- AI response format ----------------

export interface ParsedOp {
  path: string;
  action: "create" | "update" | "delete";
  language: string | null;
  summary: string;
  content: string | null;
}

export interface ParsedOutput {
  plan: string | null;
  ops: ParsedOp[];
  /** Path of a file block that started but never closed (output was cut off). */
  partialPath: string | null;
  /** Output with any trailing incomplete block removed — safe base for continuations. */
  completeText: string;
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`));
  return m ? m[1]! : null;
}

function stripFences(body: string): string {
  let b = body.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
  const fence = b.match(/^```[\w-]*\r?\n([\s\S]*?)\r?\n?```\s*$/);
  if (fence) b = fence[1]!;
  return b.endsWith("\n") ? b : `${b}\n`;
}

/** Parses the documented <plan>/<file>/<delete> response format. Later blocks for the same path win. */
export function parseCodeOutput(text: string): ParsedOutput {
  const planM = text.match(/<plan>([\s\S]*?)<\/plan>/);
  const plan = planM ? planM[1]!.trim() : null;
  const ops = new Map<string, ParsedOp>();
  const re = /<file\b([^>]*)>([\s\S]*?)<\/file>|<delete\b([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  let lastEnd = planM ? planM.index! + planM[0].length : 0;
  while ((m = re.exec(text))) {
    lastEnd = m.index + m[0].length;
    const tag = m[1] ?? m[3] ?? "";
    const path = attr(tag, "path");
    if (!path) continue;
    if (m[3] !== undefined) {
      ops.set(path, { path, action: "delete", language: null, summary: attr(tag, "summary") ?? "Delete file", content: null });
    } else {
      const action = attr(tag, "action") === "create" ? "create" : "update";
      ops.set(path, { path, action, language: attr(tag, "language"), summary: attr(tag, "summary") ?? "", content: stripFences(m[2] ?? "") });
    }
  }
  const tail = text.slice(lastEnd);
  const open = tail.match(/<file\b([^>]*)>/);
  const partialPath = open ? attr(open[1] ?? "", "path") : null;
  const completeText = open ? text.slice(0, lastEnd + (open.index ?? 0)) : text;
  return { plan, ops: [...ops.values()], partialPath, completeText };
}

export function normalizeFinishReason(r: string | null | undefined): "completed" | "length" | "stopped" | "other" {
  const v = (r ?? "").toLowerCase();
  if (v === "length" || v === "max_tokens" || v === "max_output_tokens") return "length";
  if (v === "stop" || v === "end_turn" || v === "stop_sequence" || v === "completed") return "completed";
  if (v === "stopped" || v === "cancelled") return "stopped";
  return v ? "other" : "completed";
}

// ---------------- Templates & README ----------------

export function starterFiles(framework: Framework, title: string): { path: string; content: string }[] {
  const safeTitle = title.replace(/[<>&"]/g, "");
  if (framework === "static_html") {
    return [
      { path: "index.html", content: `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${safeTitle}</title>\n    <link rel="stylesheet" href="styles.css" />\n  </head>\n  <body>\n    <main class="hero">\n      <h1>${safeTitle}</h1>\n      <p>Describe what you want to build in the chat.</p>\n    </main>\n    <script src="script.js"></script>\n  </body>\n</html>\n` },
      { path: "styles.css", content: `body {\n  margin: 0;\n  font-family: system-ui, sans-serif;\n  background: #0f0f10;\n  color: #f4f4f5;\n}\n.hero {\n  min-height: 100vh;\n  display: grid;\n  place-content: center;\n  text-align: center;\n}\n` },
      { path: "script.js", content: `console.log("Project ready");\n` },
    ];
  }
  return [
    { path: "index.html", content: `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${safeTitle}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n` },
    { path: "package.json", content: JSON.stringify({ name: "app", private: true, version: "0.0.0", type: "module", scripts: { dev: "vite", build: "vite build", preview: "vite preview" }, dependencies: { react: "^19.2.0", "react-dom": "^19.2.0" }, devDependencies: { "@vitejs/plugin-react": "^5.0.0", vite: "^7.0.0" } }, null, 2) + "\n" },
    { path: "vite.config.js", content: `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({ plugins: [react()] });\n` },
    { path: "src/main.jsx", content: `import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App.jsx";\nimport "./index.css";\n\ncreateRoot(document.getElementById("root")).render(\n  <StrictMode>\n    <App />\n  </StrictMode>,\n);\n` },
    { path: "src/App.jsx", content: `export default function App() {\n  return (\n    <main className="hero">\n      <h1>${safeTitle}</h1>\n      <p>Describe what you want to build in the chat.</p>\n    </main>\n  );\n}\n` },
    { path: "src/index.css", content: `body {\n  margin: 0;\n  font-family: system-ui, sans-serif;\n  background: #0f0f10;\n  color: #f4f4f5;\n}\n.hero {\n  min-height: 100vh;\n  display: grid;\n  place-content: center;\n  text-align: center;\n}\n` },
  ];
}

export function buildProjectReadme(p: { title: string; framework: Framework; files: { path: string; content: string }[] }): string {
  const manifest = p.files.map((f) => `- \`${f.path}\` (${byteLength(f.content)} bytes)`).join("\n");
  const run = p.framework === "react_vite"
    ? "This is a React + Vite project.\n\n```bash\nnpm install\nnpm run dev\n```\n\nThen open the address Vite prints (usually http://localhost:5173)."
    : "This is a static HTML/CSS/JS site. Open `index.html` in a browser, or serve the folder:\n\n```bash\nnpx serve .\n```";
  return `# ${p.title}\n\nExported from Unified AI Workspace on ${new Date().toISOString().slice(0, 10)}.\n\n## Framework\n\n${p.framework === "react_vite" ? "React + Vite" : "Static HTML"}\n\n## Run locally\n\n${run}\n\n## Files\n\n${manifest}\n\n## Notes\n\n- No API keys, environment files or credentials are included in this export.\n- If the project needs secrets, add them yourself in a local \`.env\` file that you never commit.\n`;
}
