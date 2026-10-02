import { supabase } from "@/integrations/supabase/client";

export interface ChatSummary {
  id: string;
  title: string;
  updated_at: string;
}

export interface ChatDetail extends ChatSummary {
  selected_connection_id: string | null;
  selected_model_id: string | null;
  system_prompt: string | null;
  temperature: number | null;
  max_tokens: number | null;
  top_p: number | null;
  is_archived: boolean;
}

export interface ChatMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  status: "streaming" | "complete" | "error" | "stopped";
  error_message: string | null;
  created_at: string;
  model_id: string | null;
  model_label: string | null;
}

export interface SelectableModel {
  id: string;
  display_name: string;
  provider_model_id: string;
  connection_id: string;
  connection_name: string;
  provider_type: string;
  scope: "personal" | "global";
}

export const chatKeys = {
  list: ["chats", "list"] as const,
  detail: (id: string) => ["chats", "detail", id] as const,
  messages: (id: string) => ["chats", "messages", id] as const,
  selectableModels: ["models", "selectable"] as const,
};

export async function listChats(): Promise<ChatSummary[]> {
  const { data, error } = await supabase.from("chats").select("id, title, updated_at")
    .eq("is_archived", false).order("updated_at", { ascending: false }).limit(200);
  if (error) throw new Error("Couldn't load your chats.");
  return data;
}

export async function getChat(id: string): Promise<ChatDetail | null> {
  const { data, error } = await supabase.from("chats")
    .select("id, title, updated_at, selected_connection_id, selected_model_id, system_prompt, temperature, max_tokens, top_p, is_archived")
    .eq("id", id).maybeSingle();
  if (error) throw new Error("Couldn't load this chat.");
  return data;
}

export async function listMessages(chatId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase.from("messages")
    .select("id, role, content, status, error_message, created_at, model_id, models(display_name, connections(name))")
    .eq("chat_id", chatId).order("created_at", { ascending: true });
  if (error) throw new Error("Couldn't load messages.");
  return data.map(({ models, ...m }) => {
    const md = models as { display_name: string; connections: { name: string } | null } | null;
    return { ...m, model_label: md ? (md.connections ? `${md.connections.name} · ${md.display_name}` : md.display_name) : null } as ChatMessage;
  });
}

export async function createChat(userId: string): Promise<string> {
  const { data, error } = await supabase.from("chats").insert({ user_id: userId }).select("id").single();
  if (error) throw new Error("Couldn't create a chat.");
  return data.id;
}

export type ChatPatch = Partial<Pick<ChatDetail,
  "title" | "selected_connection_id" | "selected_model_id" | "system_prompt" | "temperature" | "max_tokens" | "top_p" | "is_archived">>;

export async function updateChat(id: string, patch: ChatPatch): Promise<void> {
  const { error } = await supabase.from("chats").update(patch).eq("id", id);
  if (error) throw new Error("Couldn't save the chat.");
}

export async function deleteChat(id: string): Promise<void> {
  const { error } = await supabase.from("chats").delete().eq("id", id);
  if (error) throw new Error("Couldn't delete the chat.");
}

/** Enabled models from enabled connections visible to the user (RLS-scoped). */
export async function listSelectableModels(): Promise<SelectableModel[]> {
  const { data, error } = await supabase.from("models")
    .select("id, display_name, provider_model_id, connection_id, connections(name, enabled, provider_type, scope)")
    .eq("enabled", true).order("display_name");
  if (error) throw new Error("Couldn't load models.");
  return data.flatMap((m) => {
    const c = m.connections as { name: string; enabled: boolean; provider_type: string; scope: string } | null;
    return c?.enabled ? [{
      id: m.id, display_name: m.display_name, provider_model_id: m.provider_model_id, connection_id: m.connection_id,
      connection_name: c.name, provider_type: c.provider_type, scope: c.scope === "global" ? "global" as const : "personal" as const,
    }] : [];
  });
}

export function groupChatsByDate(chats: ChatSummary[], now = new Date()) {
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const groups: { label: string; items: ChatSummary[] }[] = [
    { label: "Today", items: [] }, { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] }, { label: "Older", items: [] },
  ];
  for (const c of chats) {
    const t = new Date(c.updated_at).getTime();
    const g = t >= startToday ? 0 : t >= startToday - day ? 1 : t >= startToday - 7 * day ? 2 : 3;
    groups[g]!.items.push(c);
  }
  return groups.filter((g) => g.items.length > 0);
}

export async function deleteMessage(id: string): Promise<void> {
  const { error } = await supabase.from("messages").delete().eq("id", id);
  if (error) throw new Error("Couldn't delete the message.");
}

/** Deletes the given message and everything after it in the chat (used by edit/regenerate). */
export async function deleteMessagesFrom(chatId: string, fromCreatedAt: string): Promise<void> {
  const { error } = await supabase.from("messages").delete().eq("chat_id", chatId).gte("created_at", fromCreatedAt);
  if (error) throw new Error("Couldn't update the conversation.");
}
