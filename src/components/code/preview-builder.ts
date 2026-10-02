// Browser-only preview bundler. Produces an HTML document for a sandboxed iframe (allow-scripts only,
// opaque origin). Never runs on the server and never includes app secrets, sessions or env vars.
import type { Framework } from "@/lib/code-shared";

export type PreviewBuild = { ok: true; html: string } | { ok: false; unsupported: boolean; message: string };

interface FileLike { path: string; content: string }

const REACT_VERSION = "19.2.0";
const UNSUPPORTED_DEPS = /^(next|express|fastify|koa|hapi|@nestjs\/.*|prisma|@prisma\/.*|pg|mysql2?|sqlite3|better-sqlite3|mongoose|mongodb|redis|@remix-run\/.*|nuxt|vue|svelte|@sveltejs\/.*|@angular\/.*|electron|react-native|expo|astro|solid-js|@supabase\/supabase-js|firebase-admin|dotenv)$/;

const CSP = `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://esm.sh; style-src 'unsafe-inline' https://esm.sh https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data: blob: https:; media-src data: blob:; connect-src https://esm.sh; frame-src 'none'; form-action 'none'; base-uri 'none'`;

const BRIDGE = `<script>(function(){
  var post=function(level,args){try{var t=Array.prototype.map.call(args,function(a){if(a instanceof Error)return a.name+": "+a.message;if(typeof a==="object"){try{return JSON.stringify(a)}catch(e){return String(a)}}return String(a)}).join(" ");parent.postMessage({__uawPreview:1,level:level,text:t.slice(0,2000)},"*")}catch(e){}};
  ["log","info","warn","error"].forEach(function(l){var o=console[l];console[l]=function(){post(l,arguments);o&&o.apply(console,arguments)}});
  window.addEventListener("error",function(e){post("error",[(e.error&&e.error.message)||e.message||"Script error"])});
  window.addEventListener("unhandledrejection",function(e){post("error",["Unhandled promise rejection: "+((e.reason&&e.reason.message)||String(e.reason))])});
  window.open=function(){post("warn",["window.open is blocked in preview"]);return null};
})();</script>`;

function head(extra = "") {
  return `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="viewport" content="width=device-width,initial-scale=1">${BRIDGE}${extra}`;
}

function esc(code: string) { return code.replace(/<\/script/gi, "<\\/script"); }

function resolveRel(fromPath: string, spec: string): string {
  const base = spec.startsWith("/") ? [] : fromPath.split("/").slice(0, -1);
  for (const seg of spec.replace(/^\//, "").split("/")) {
    if (seg === "..") base.pop(); else if (seg && seg !== ".") base.push(seg);
  }
  return base.join("/");
}

export function detectUnsupported(files: FileLike[]): string | null {
  const pkg = files.find((f) => f.path === "package.json");
  if (pkg) {
    try {
      const j = JSON.parse(pkg.content) as { dependencies?: Record<string, string> };
      const bad = Object.keys(j.dependencies ?? {}).filter((d) => UNSUPPORTED_DEPS.test(d));
      if (bad.length) return `Uses ${bad.slice(0, 3).join(", ")}, which needs a server or a different framework.`;
    } catch { return "package.json is not valid JSON."; }
  }
  if (files.some((f) => /(^|\/)(server|api)\//.test(f.path) && /\.(t|j)s$/.test(f.path))) return "Contains server/API code that can't run in a browser.";
  return null;
}

function buildStatic(files: FileLike[]): PreviewBuild {
  const map = new Map(files.map((f) => [f.path, f.content]));
  const index = map.get("index.html");
  if (!index) return { ok: false, unsupported: false, message: "Add an index.html file to preview this site." };
  let html = index
    .replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi, (tag) => {
      const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
      if (!href || /^(https?:)?\/\//.test(href)) return tag;
      const css = map.get(resolveRel("index.html", href));
      return css !== undefined ? `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>` : "";
    })
    .replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi, (tag, a: string, src: string, b: string) => {
      if (/^(https?:)?\/\//.test(src)) return /esm\.sh/.test(src) ? tag : "";
      const js = map.get(resolveRel("index.html", src));
      return js !== undefined ? `<script${a}${b}>${esc(js)}</script>` : "";
    })
    .replace(/<base\b[^>]*>/gi, "");
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${head()}`) : `<!doctype html><html><head>${head()}</head><body>${html}</body></html>`;
  return { ok: true, html };
}

async function buildReact(files: FileLike[]): Promise<PreviewBuild> {
  const { transform } = await import("sucrase");
  const map = new Map(files.map((f) => [f.path, f.content]));
  const indexHtml = map.get("index.html") ?? "";
  const entryFromHtml = indexHtml.match(/<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/i)?.[1];
  const candidates = [entryFromHtml ? resolveRel("index.html", entryFromHtml) : "", "src/main.tsx", "src/main.jsx", "src/main.ts", "src/main.js", "src/index.tsx", "src/index.jsx"];
  const entry = candidates.find((c) => c && map.has(c));
  if (!entry) return { ok: false, unsupported: false, message: "Couldn't find an entry file such as src/main.jsx." };

  let deps: Record<string, string> = {};
  try { deps = (JSON.parse(map.get("package.json") ?? "{}") as { dependencies?: Record<string, string> }).dependencies ?? {}; } catch { /* checked earlier */ }

  const modules: string[] = [];
  const bare = new Set<string>();
  for (const f of files) {
    if (!/\.(m?jsx?|tsx?)$/.test(f.path) || f.path === "vite.config.js" || f.path === "vite.config.ts") continue;
    let code: string;
    try {
      code = transform(f.content, {
        transforms: f.path.endsWith(".ts") ? ["typescript", "imports"] : f.path.endsWith(".tsx") ? ["typescript", "jsx", "imports"] : ["jsx", "imports"],
        jsxRuntime: "automatic", production: true, filePath: f.path,
      }).code;
    } catch (e) {
      return { ok: false, unsupported: false, message: `Syntax error in ${f.path}: ${e instanceof Error ? e.message.slice(0, 300) : "could not compile"}` };
    }
    for (const m of code.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
      const s = m[1]!;
      if (!s.startsWith(".") && !s.startsWith("/")) bare.add(s);
    }
    modules.push(esc(`${JSON.stringify(f.path)}:function(require,module,exports){${code}\n}`));
  }
  const assets: string[] = [];
  for (const f of files) {
    if (f.path.endsWith(".css")) assets.push(esc(`${JSON.stringify(f.path)}:{css:${JSON.stringify(f.content)}}`));
    else if (f.path.endsWith(".json")) assets.push(`${JSON.stringify(f.path)}:{json:${JSON.stringify(f.content)}}`.replace(/<\/script/gi, "<\\/script"));
    else if (f.path.endsWith(".svg")) assets.push(`${JSON.stringify(f.path)}:{url:${JSON.stringify(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(f.content)}`)}}`);
  }
  const urlFor = (spec: string) => {
    if (spec === "react" || spec.startsWith("react/")) return `https://esm.sh/react@${REACT_VERSION}${spec.slice(5)}`;
    if (spec === "react-dom" || spec.startsWith("react-dom/")) return `https://esm.sh/react-dom@${REACT_VERSION}${spec.slice(9)}?deps=react@${REACT_VERSION}`;
    const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]!;
    if (UNSUPPORTED_DEPS.test(name)) return null;
    const ver = (deps[name] ?? "").replace(/^[\^~>=<\s]+/, "");
    const rest = spec.slice(name.length);
    return `https://esm.sh/${name}${/^[\w.-]+$/.test(ver) ? `@${ver}` : ""}${rest}?deps=react@${REACT_VERSION},react-dom@${REACT_VERSION}`;
  };
  const ext: string[] = [];
  for (const s of bare) {
    const u = urlFor(s);
    if (!u) return { ok: false, unsupported: true, message: `The package “${s}” needs a server and can't run in the browser preview.` };
    ext.push(`[${JSON.stringify(s)},${JSON.stringify(u)}]`);
  }
  const body = (indexHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? `<div id="root"></div>`).replace(/<script\b[\s\S]*?<\/script>/gi, "");
  const runtime = `<script type="module">
const M={${modules.join(",\n")}};
const A={${assets.join(",")}};
const EXT=[${ext.join(",")}];
const loaded={};const cache={};
function overlay(msg){const d=document.createElement("pre");d.style.cssText="position:fixed;inset:0;margin:0;padding:16px;background:#1a0b0b;color:#fecaca;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;z-index:2147483647;overflow:auto";d.textContent="Preview error\\n\\n"+msg;document.body.appendChild(d);}
function find(p){if(M[p]||A[p])return p;for(const e of [".tsx",".ts",".jsx",".js",".json",".css","/index.tsx","/index.ts","/index.jsx","/index.js"]){if(M[p+e]||A[p+e])return p+e;}return null;}
function makeRequire(from){return function(spec){
  if(!spec.startsWith(".")&&!spec.startsWith("/")){if(spec in loaded)return loaded[spec];throw new Error("Package not available in preview: "+spec);}
  const base=spec.startsWith("/")?[]:from.split("/").slice(0,-1);for(const s of spec.replace(/^\\//,"").split("/")){if(s==="..")base.pop();else if(s&&s!==".")base.push(s);}
  const p=find(base.join("/"));if(!p)throw new Error("Cannot find module '"+spec+"' imported from "+from);
  if(cache[p])return cache[p].exports;
  if(A[p]){const a=A[p];let ex;if(a.css!==undefined){const st=document.createElement("style");st.textContent=a.css;document.head.appendChild(st);ex={};}else if(a.json!==undefined){ex=JSON.parse(a.json);ex={__esModule:true,default:ex,...ex};}else{ex={__esModule:true,default:a.url};}cache[p]={exports:ex};return ex;}
  const module={exports:{}};cache[p]=module;M[p](makeRequire(p),module,module.exports);return module.exports;};}
try{
  const mods=await Promise.all(EXT.map(([s,u])=>import(u).then(ns=>[s,ns])));
  for(const [s,ns] of mods){const o={__esModule:true,...ns};o.default=ns.default!==undefined?ns.default:ns;loaded[s]=o;}
  makeRequire("")(${JSON.stringify("/" + entry)});
}catch(e){console.error(e);overlay((e&&e.stack)||String(e));}
</script>`;
  return { ok: true, html: `<!doctype html><html><head>${head()}</head><body>${body}${runtime}</body></html>` };
}

export async function buildPreview(framework: Framework, files: FileLike[]): Promise<PreviewBuild> {
  const reason = detectUnsupported(files);
  if (reason) return { ok: false, unsupported: true, message: reason };
  return framework === "static_html" ? buildStatic(files) : buildReact(files);
}
