import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Framework } from "@/lib/code-shared";
import type { ChangeItem } from "@/lib/code-projects.functions";

export interface CodeProject { id: string; title: string; framework: Framework; chat_id: string | null; selected_model_id: string | null; updated_at: string }
export interface ProjectFile { id: string; path: string; content: string; language: string | null; is_entry_file: boolean; updated_at: string }
export interface FileVersion { id: string; version_number: number; change_source: string; change_summary: string | null; created_at: string; content: string }
export interface CodeRun {
  id: string; instruction: string; plan: string | null; output: string; status: string; finish_reason: string | null;
  continuation_count: number; error_message: string | null; created_at: string; updated_at: string; model_id: string | null;
}
export interface ChangeSet { id: string; generation_run_id: string; status: string; changes: ChangeItem[]; created_at: string }

export const codeKeys = {
  projects: ["code", "projects"] as const,
  project: (id: string) => ["code", "project", id] as const,
  files: (id: string) => ["code", "files", id] as const,
  runs: (id: string) => ["code", "runs", id] as const,
  versions: (fileId: string) => ["code", "versions", fileId] as const,
};

export async function listProjects(): Promise<CodeProject[]> {
  const { data, error } = await supabase.from("code_projects").select("id, title, framework, chat_id, selected_model_id, updated_at").order("updated_at", { ascending: false }).limit(100);
  if (error) throw new Error("Couldn't load your projects.");
  return data as CodeProject[];
}

export async function getProject(id: string): Promise<CodeProject | null> {
  const { data, error } = await supabase.from("code_projects").select("id, title, framework, chat_id, selected_model_id, updated_at").eq("id", id).maybeSingle();
  if (error) throw new Error("Couldn't load this project.");
  return data as CodeProject | null;
}

export async function listFiles(projectId: string): Promise<ProjectFile[]> {
  const { data, error } = await supabase.from("project_files").select("id, path, content, language, is_entry_file, updated_at").eq("project_id", projectId).order("path");
  if (error) throw new Error("Couldn't load project files.");
  return data;
}

export async function listVersions(fileId: string): Promise<FileVersion[]> {
  const { data, error } = await supabase.from("project_file_versions").select("id, version_number, change_source, change_summary, created_at, content").eq("project_file_id", fileId).order("version_number", { ascending: false }).limit(50);
  if (error) throw new Error("Couldn't load version history.");
  return data;
}

export async function listRuns(projectId: string): Promise<{ runs: CodeRun[]; sets: ChangeSet[] }> {
  const { data: runs, error } = await supabase.from("code_generation_runs").select("id, instruction, plan, output, status, finish_reason, continuation_count, error_message, created_at, updated_at, model_id")
    .eq("project_id", projectId).order("created_at", { ascending: false }).limit(30);
  if (error) throw new Error("Couldn't load coding history.");
  const ids = runs.map((r) => r.id);
  const { data: sets } = ids.length
    ? await supabase.from("code_change_sets").select("id, generation_run_id, status, changes, created_at").in("generation_run_id", ids).neq("status", "superseded").order("created_at", { ascending: false })
    : { data: [] };
  return { runs: [...runs].reverse(), sets: (sets ?? []).map((s) => ({ ...s, changes: (Array.isArray(s.changes) ? s.changes : []) as unknown as ChangeItem[] })) };
}

/** A run whose server stream silently died (tab closed / worker ended) shows as interrupted. */
export function runDisplayStatus(r: CodeRun): "streaming" | "interrupted" | "length" | "stopped" | "failed" | "review" | "complete" {
  if (r.status === "streaming" || r.status === "queued" || r.status === "planning") return Date.now() - new Date(r.updated_at).getTime() > 90_000 ? "interrupted" : "streaming";
  if (r.status === "stopped") return r.finish_reason === "length" ? "length" : r.finish_reason === "interrupted" ? "interrupted" : "stopped";
  if (r.status === "failed") return "failed";
  if (r.status === "awaiting_review") return "review";
  return "complete";
}

export interface CodeStreamState { runId: string | null; text: string; active: boolean; continuation: number }
export interface CodeStreamResult { runId: string | null; finish: string | null; count: number; error: string | null }

export function useCodeStream() {
  const [state, setState] = useState<CodeStreamState>({ runId: null, text: "", active: false, continuation: 0 });
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async (body: { projectId: string; modelId: string; instruction?: string; selectedPath?: string | null; continueRunId?: string }): Promise<CodeStreamResult> => {
    if (abortRef.current) return { runId: null, finish: null, count: 0, error: "A generation is already running." };
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const result: CodeStreamResult = { runId: body.continueRunId ?? null, finish: null, count: 0, error: null };
    let text = "";
    let frame: number | null = null;
    setState({ runId: result.runId, text: "", active: true, continuation: 0 });
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Please sign in again.");
      const res = await fetch("/api/code-generation", {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(body), signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const b: unknown = await res.json().catch(() => null);
        throw new Error(b && typeof b === "object" && "message" in b && typeof b.message === "string" ? b.message : "Couldn't start generation.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = block.match(/^event: (.+)$/m)?.[1];
          const raw = block.match(/^data: (.+)$/m)?.[1];
          if (!ev || !raw) continue;
          const p = JSON.parse(raw) as { runId?: string; text?: string; finish?: string; count?: number; message?: string; continuation?: number };
          if (ev === "run") { result.runId = p.runId ?? null; setState((s) => ({ ...s, runId: result.runId, continuation: p.continuation ?? 0 })); }
          else if (ev === "delta" && p.text) {
            text += p.text;
            if (frame === null) frame = requestAnimationFrame(() => { frame = null; setState((s) => ({ ...s, text })); });
          } else if (ev === "complete") { result.finish = p.finish ?? null; result.count = p.count ?? 0; }
          else if (ev === "error") { result.error = p.message ?? "Generation failed."; }
        }
      }
    } catch (e) {
      if (ctrl.signal.aborted) result.finish = "stopped";
      else result.error = e instanceof Error ? e.message : "Generation failed.";
    } finally {
      if (frame !== null) cancelAnimationFrame(frame);
      abortRef.current = null;
      setState({ runId: null, text: "", active: false, continuation: 0 });
    }
    return result;
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  return { state, start, stop };
}

export function downloadText(filename: string, content: string, mime = "text/plain") {
  downloadBlob(filename, new Blob([content], { type: `${mime};charset=utf-8` }));
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
