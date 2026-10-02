import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";
import { cn } from "@/lib/utils";

/** Renders untrusted model output safely (no raw HTML) with GFM, code highlighting and math. */
export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("markdown-body", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeHighlight, rehypeKatex]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
