// Lazy-loaded CodeMirror editor (only imported when the Code tab opens).
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { undo, redo } from "@codemirror/commands";
import { useTheme } from "@/lib/theme";

export interface EditorHandle { undo: () => void; redo: () => void }

function langFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "ts") return [javascript({ typescript: true })];
  if (ext === "tsx") return [javascript({ typescript: true, jsx: true })];
  if (ext === "js" || ext === "jsx") return [javascript({ jsx: true })];
  if (ext === "html" || ext === "svg") return [html()];
  if (ext === "css") return [css()];
  if (ext === "json") return [json()];
  if (ext === "md") return [markdown()];
  return [];
}

const CodeEditor = forwardRef<EditorHandle, { path: string; value: string; onChange: (v: string) => void; onSave: () => void }>(
  function CodeEditor({ path, value, onChange, onSave }, ref) {
    const cm = useRef<ReactCodeMirrorRef>(null);
    const { resolved } = useTheme();
    const extensions = useMemo(() => langFor(path), [path]);
    useImperativeHandle(ref, () => ({
      undo: () => { if (cm.current?.view) undo(cm.current.view); },
      redo: () => { if (cm.current?.view) redo(cm.current.view); },
    }));
    return (
      <div className="h-full min-h-0 overflow-hidden text-[13px]" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); onSave(); } }}>
        <CodeMirror ref={cm} key={path} value={value} onChange={onChange} extensions={extensions} theme={resolved === "dark" ? "dark" : "light"}
          height="100%" className="h-full" basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, searchKeymap: true }} aria-label={`Editor for ${path}`} />
      </div>
    );
  },
);

export default CodeEditor;
