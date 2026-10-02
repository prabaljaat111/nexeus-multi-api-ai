import { memo, useRef, useState, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import { Check, Copy } from "lucide-react";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";
import { cn } from "@/lib/utils";

function CodeBlock(props: ComponentPropsWithoutRef<"pre">) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const { className, children, ...rest } = props;
  async function copy() {
    const text = ref.current?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }
  return (
    <div className="group relative">
      <button type="button" onClick={() => void copy()} aria-label={copied ? "Copied" : "Copy code"}
        className="absolute right-2 top-2 z-10 rounded-md border bg-background/80 p-1.5 text-muted-foreground opacity-70 transition hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100">
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
      <pre ref={ref} className={cn("overflow-x-auto", className)} {...rest}>{children}</pre>
    </div>
  );
}

/**
 * Renders untrusted model output safely: raw HTML is never rendered (no rehype-raw),
 * and react-markdown strips dangerous URL protocols. GFM, highlighting and KaTeX enabled.
 */
export const Markdown = memo(function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("markdown-body", className)}>
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }], [rehypeKatex, { throwOnError: false, strict: "ignore", trust: false }]]}
        components={{
          pre: CodeBlock,
          a: ({ node: _n, ...p }) => <a {...p} target="_blank" rel="noopener noreferrer nofollow" />,
          table: ({ node: _n, ...p }) => <div className="overflow-x-auto"><table {...p} /></div>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
