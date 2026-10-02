import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { CODE_LIMITS, byteLength, fileTypeFor, isEntryPath, languageFor, validateWrite, type Framework } from "./code-shared";

type Admin = SupabaseClient<Database>;

export class CodeError extends Error {}

/** Writes a file and records a new version. Caller must have verified project ownership. */
export async function writeProjectFile(admin: Admin, opts: {
  projectId: string; framework: Framework; path: string; content: string;
  source: "user" | "assistant" | "restore"; summary: string | null; createdBy: "user" | "assistant" | "system";
}): Promise<string> {
  const v = validateWrite(opts.path, opts.content);
  if (!v.ok) throw new CodeError(v.error);
  const path = v.path;

  const { data: files } = await admin.from("project_files").select("id, path, content").eq("project_id", opts.projectId);
  const existing = (files ?? []).find((f) => f.path === path);
  if (!existing && (files?.length ?? 0) >= CODE_LIMITS.maxFiles) throw new CodeError(`Projects can have at most ${CODE_LIMITS.maxFiles} files.`);
  const total = (files ?? []).reduce((n, f) => n + (f.path === path ? 0 : byteLength(f.content)), 0) + byteLength(opts.content);
  if (total > CODE_LIMITS.maxProjectBytes) throw new CodeError("This change would make the project larger than 2 MB of source.");

  let fileId: string;
  if (existing) {
    if (existing.content === opts.content) return existing.id;
    const { error } = await admin.from("project_files").update({ content: opts.content, language: languageFor(path), updated_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) throw new CodeError("Couldn't save the file.");
    fileId = existing.id;
  } else {
    const { data, error } = await admin.from("project_files").insert({
      project_id: opts.projectId, path, content: opts.content, language: languageFor(path), file_type: fileTypeFor(path),
      is_entry_file: isEntryPath(path, opts.framework), created_by: opts.createdBy,
    }).select("id").single();
    if (error || !data) throw new CodeError("Couldn't create the file.");
    fileId = data.id;
  }
  const { data: last } = await admin.from("project_file_versions").select("version_number").eq("project_file_id", fileId).order("version_number", { ascending: false }).limit(1).maybeSingle();
  await admin.from("project_file_versions").insert({
    project_file_id: fileId, project_id: opts.projectId, version_number: (last?.version_number ?? 0) + 1,
    content: opts.content, change_source: opts.source, change_summary: opts.summary?.slice(0, 500) ?? null,
  });
  await admin.from("code_projects").update({ updated_at: new Date().toISOString() }).eq("id", opts.projectId);
  return fileId;
}
