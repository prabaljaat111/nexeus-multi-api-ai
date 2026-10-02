import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AdminUserRow {
  id: string;
  displayName: string | null;
  email: string | null;
  isAdmin: boolean;
  isApproved: boolean;
  isDisabled: boolean;
  createdAt: string;
}

const FRIENDLY: Record<string, string> = {
  not_admin: "You need administrator access to do that.",
  cannot_disable_self: "You can't disable your own account.",
  last_admin: "You can't remove the last remaining administrator.",
  user_not_found: "That user no longer exists.",
};

function friendly(message: string | undefined): Error {
  const key = Object.keys(FRIENDLY).find((k) => message?.includes(k));
  return new Error((key && FRIENDLY[key]) || "The action couldn't be completed. Please try again.");
}

type AuthedSupabase = { rpc: (fn: "is_admin") => PromiseLike<{ data: boolean | null; error: unknown }> };

async function assertAdmin(supabase: AuthedSupabase) {
  const { data, error } = await supabase.rpc("is_admin");
  if (error || data !== true) throw new Error(FRIENDLY['not_admin']);
}

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    const { supabase } = context;
    await assertAdmin(supabase);

    const [profilesRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("id, display_name, is_approved, is_disabled, created_at").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role").eq("role", "admin"),
    ]);
    if (profilesRes.error || rolesRes.error) {
      console.error(profilesRes.error ?? rolesRes.error);
      throw new Error("Couldn't load users. Please try again.");
    }

    // Emails live in the auth system; read them only after the caller is verified as admin.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const emails = new Map<string, string | null>();
    for (let page = 1; page <= 50; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) {
        console.error(error);
        throw new Error("Couldn't load user emails. Please try again.");
      }
      data.users.forEach((u) => emails.set(u.id, u.email ?? null));
      if (data.users.length < 1000) break;
    }

    const admins = new Set(rolesRes.data.map((r) => r.user_id));
    return profilesRes.data.map((p) => ({
      id: p.id,
      displayName: p.display_name,
      email: emails.get(p.id) ?? null,
      isAdmin: admins.has(p.id),
      isApproved: p.is_approved,
      isDisabled: p.is_disabled,
      createdAt: p.created_at,
    }));
  });

const actionSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(["approve", "unapprove", "disable", "enable", "grant_admin", "remove_admin"]),
});

export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => actionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertAdmin(supabase);
    const { userId, action } = data;

    const result =
      action === "approve" || action === "unapprove"
        ? await supabase.rpc("admin_set_approval", { _user_id: userId, _approved: action === "approve" })
        : action === "disable" || action === "enable"
          ? await supabase.rpc("admin_set_disabled", { _user_id: userId, _disabled: action === "disable" })
          : await supabase.rpc("admin_set_admin", { _user_id: userId, _grant: action === "grant_admin" });

    if (result.error) {
      console.error("admin action failed", action, result.error.message);
      throw friendly(result.error.message);
    }
    return { ok: true as const };
  });
