import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { buildProjectReadme, normalizeProjectPath, starterFiles, validateWrite, type Framework } from "./code-shared";

type Sb = SupabaseClient<Database>;

async function assertActive(sb: Sb) {
  const { data } = await sb.rpc("is_active_approved_user");
  if (data !== true) throw new Error("Your account isn't approved or is disabled.");
}

async function ownProject(sb: Sb, userId: string, projectId: string) {
  await assertActive(sb);
  const { data } = await sb.from("code_projects").select("id, title, framework, chat_id, user_id").eq("id", projectId).eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("This project no longer exists.");
  return { ...data, framework: data.framework as Framework };
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function friendly(e: unknown): Error {
  if (e instanceof Error && e.constructor.name === "CodeError") return e;
  if (e instanceof Error && /no longer exists|isn't approved|not allowed|too/.test(e.message)) return e;
  console.error("code project action failed");
  return new Error("Something went wrong saving your project. Please try again.");
}

export interface ChangeItem {
  id: string; path: string; action: "create" | "update" | "delete"; language: string | null; summary: string;
  content: string | null; status: "pending" | "applied" | "rejected"; error?: string | null;
}

export const createCodeProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    title: z.string().trim().min(1).max(80),
    framework: z.enum(["static_html", "react_vite"]),
    chatId: z.string().uuid().nullish(),
    modelId: z.string().uuid().nullish(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertActive(supabase);
    let chatId = data.chatId ?? null;
    if (chatId) {
      const { data: chat } = await supabase.from("chats").select("id").eq("id", chatId).eq("user_id", userId).maybeSingle();
      if (!chat) throw new Error("That chat no longer exists.");
    } else {
      const { data: chat, error } = await supabase.from("chats").insert({ user_id: userId, title: `Build: ${data.title}`.slice(0, 80) }).select("id").single();
      if (error || !chat) throw new Error("Couldn't create the project chat.");
      chatId = chat.id;
    }
    let modelId = data.modelId ?? null;
    if (modelId) {
      const { data: m } = await supabase.from("models").select("id, connection_id").eq("id", modelId).maybeSingle();
      const { data: ok } = m ? await supabase.rpc("can_view_connection", { _connection_id: m.connection_id }) : { data: false };
      if (ok !== true) modelId = null;
    }
    const sa = await admin();
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await sa.from("code_projects").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
    if ((count ?? 0) >= 30) throw new Error("You've created a lot of projects recently. Try again later.");
    const { data: proj, error } = await sa.from("code_projects").insert({ user_id: userId, chat_id: chatId, title: data.title, framework: data.framework, selected_model_id: modelId }).select("id").single();
    if (error || !proj) throw new Error("Couldn't create the project.");
    const { writeProjectFile } = await import("./code-projects.server");
    for (const f of starterFiles(data.framework, data.title)) {
      await writeProjectFile(sa, { projectId: proj.id, framework: data.framework, path: f.path, content: f.content, source: "user", summary: "Starter template", createdBy: "system" });
    }
    return { id: proj.id };
  });

export const updateCodeProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    title: z.string().trim().min(1).max(80).optional(),
    modelId: z.string().uuid().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await ownProject(context.supabase, context.userId, data.projectId);
    const patch: Database["public"]["Tables"]["code_projects"]["Update"] = {};
    if (data.title) patch.title = data.title;
    if (data.modelId !== undefined) {
      if (data.modelId) {
        const { data: m } = await context.supabase.from("models").select("id, connection_id").eq("id", data.modelId).maybeSingle();
        const { data: ok } = m ? await context.supabase.rpc("can_view_connection", { _connection_id: m.connection_id }) : { data: false };
        if (ok !== true) throw new Error("This model is no longer available.");
      }
      patch.selected_model_id = data.modelId;
    }
    const sa = await admin();
    const { error } = await sa.from("code_projects").update(patch).eq("id", data.projectId);
    if (error) throw new Error("Couldn't update the project.");
    return { ok: true };
  });

export const deleteCodeProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ownProject(context.supabase, context.userId, data.projectId);
    const sa = await admin();
    await sa.from("code_projects").delete().eq("id", data.projectId);
    return { ok: true };
  });

export const saveProjectFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), path: z.string().max(300), content: z.string().max(400_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const p = await ownProject(context.supabase, context.userId, data.projectId);
    const { writeProjectFile } = await import("./code-projects.server");
    try {
      await writeProjectFile(await admin(), { projectId: p.id, framework: p.framework, path: data.path, content: data.content, source: "user", summary: "Manual edit", createdBy: "user" });
    } catch (e) { throw friendly(e); }
    return { ok: true };
  });

export const renameProjectFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), fileId: z.string().uuid(), newPath: z.string().max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    await ownProject(context.supabase, context.userId, data.projectId);
    const n = normalizeProjectPath(data.newPath);
    if (!n.ok) throw new Error(n.error);
    const sa = await admin();
    const { data: clash } = await sa.from("project_files").select("id").eq("project_id", data.projectId).eq("path", n.path).maybeSingle();
    if (clash) throw new Error("A file with that name already exists.");
    const { error } = await sa.from("project_files").update({ path: n.path, updated_at: new Date().toISOString() }).eq("id", data.fileId).eq("project_id", data.projectId);
    if (error) throw new Error("Couldn't rename the file.");
    return { ok: true };
  });

export const deleteProjectFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), fileId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ownProject(context.supabase, context.userId, data.projectId);
    const sa = await admin();
    await sa.from("project_files").delete().eq("id", data.fileId).eq("project_id", data.projectId);
    return { ok: true };
  });

export const restoreProjectFileVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), versionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const p = await ownProject(context.supabase, context.userId, data.projectId);
    const sa = await admin();
    const { data: ver } = await sa.from("project_file_versions").select("id, content, version_number, project_file_id, project_files(path)").eq("id", data.versionId).eq("project_id", p.id).maybeSingle();
    const path = (ver?.project_files as { path: string } | null)?.path;
    if (!ver || !path) throw new Error("That version is no longer available.");
    const { writeProjectFile } = await import("./code-projects.server");
    try {
      await writeProjectFile(sa, { projectId: p.id, framework: p.framework, path, content: ver.content, source: "restore", summary: `Restored version ${ver.version_number}`, createdBy: "user" });
    } catch (e) { throw friendly(e); }
    return { ok: true };
  });

/** apply-code-changes: applies or rejects selected items of a pending change set. */
export const applyCodeChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(), changeSetId: z.string().uuid(),
    changeIds: z.array(z.string().max(64)).min(1).max(100), decision: z.enum(["apply", "reject"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const p = await ownProject(context.supabase, context.userId, data.projectId);
    const sa = await admin();
    const { data: set } = await sa.from("code_change_sets").select("id, generation_run_id, changes, status").eq("id", data.changeSetId).eq("project_id", p.id).maybeSingle();
    if (!set) throw new Error("These changes are no longer available.");
    if (set.status === "superseded") throw new Error("These changes were replaced by a newer revision.");
    const items = (Array.isArray(set.changes) ? set.changes : []) as unknown as ChangeItem[];
    const { writeProjectFile } = await import("./code-projects.server");
    const errors: string[] = [];
    for (const it of items) {
      if (!data.changeIds.includes(it.id) || it.status !== "pending") continue;
      if (data.decision === "reject") { it.status = "rejected"; continue; }
      try {
        if (it.action === "delete") {
          const n = normalizeProjectPath(it.path);
          if (!n.ok) throw new Error(n.error);
          await sa.from("project_files").delete().eq("project_id", p.id).eq("path", n.path);
        } else {
          const v = validateWrite(it.path, it.content ?? "");
          if (!v.ok) throw new Error(v.error);
          await writeProjectFile(sa, { projectId: p.id, framework: p.framework, path: v.path, content: it.content ?? "", source: "assistant", summary: it.summary, createdBy: "assistant" });
        }
        it.status = "applied"; it.error = null;
      } catch (e) {
        it.error = e instanceof Error && e.constructor.name !== "Error" ? e.message : e instanceof Error ? e.message.slice(0, 200) : "Couldn't apply this change.";
        errors.push(`${it.path}: ${it.error}`);
      }
    }
    const pending = items.some((i) => i.status === "pending");
    const applied = items.filter((i) => i.status === "applied").length;
    const status = pending ? (applied ? "partially_applied" : "pending") : applied === items.length ? "applied" : applied ? "partially_applied" : "rejected";
    await sa.from("code_change_sets").update({ changes: items as unknown as Json, status, updated_at: new Date().toISOString() }).eq("id", set.id);
    if (!pending) await sa.from("code_generation_runs").update({ status: "complete", updated_at: new Date().toISOString() }).eq("id", set.generation_run_id);
    return { status, errors };
  });

/** Turns the completed files of a stopped/length-limited run into a reviewable change set. */
export const finalizeCodeRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const p = await ownProject(context.supabase, context.userId, data.projectId);
    const sa = await admin();
    const { data: run } = await sa.from("code_generation_runs").select("id, output, status").eq("id", data.runId).eq("project_id", p.id).maybeSingle();
    if (!run) throw new Error("This run no longer exists.");
    const { createChangeSetFromOutput } = await import("./code-gen.server");
    const res = await createChangeSetFromOutput(sa, p.id, run.id, run.output);
    if (!res.count) throw new Error("No complete file changes were found in this response yet. Try Continue.");
    return res;
  });

/** export-code-project: builds a ZIP server-side and returns it as an authorized one-time download payload. */
export const exportCodeProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const p = await ownProject(context.supabase, context.userId, data.projectId);
    const sa = await admin();
    const { data: files } = await sa.from("project_files").select("path, content").eq("project_id", p.id).order("path");
    const { zipSync, strToU8 } = await import("fflate");
    const { containsSecret } = await import("./code-shared");
    const safe = (files ?? []).filter((f) => normalizeProjectPath(f.path).ok && !containsSecret(f.content));
    const entries: Record<string, Uint8Array> = {};
    for (const f of safe) entries[f.path] = strToU8(f.content);
    const readme = buildProjectReadme({ title: p.title, framework: p.framework, files: safe });
    entries[entries["README.md"] ? "WORKSPACE_README.md" : "README.md"] = strToU8(readme);
    const zip = zipSync(entries, { level: 6 });
    const filename = `${p.title.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "project"}.zip`;
    return { filename, base64: Buffer.from(zip).toString("base64"), skipped: (files?.length ?? 0) - safe.length };
  });
