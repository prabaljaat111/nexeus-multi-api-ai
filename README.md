# Unified AI Workspace

A multi-provider AI chat workspace, inspired by Open WebUI. **Phase 1 is the foundation only:** auth, app shell, theming, route guards and shared UI states.

## Stack
TanStack Start (React 19, Vite, TanStack Router + Query), Tailwind v4, shadcn/ui, Lucide, Lovable Cloud (Postgres, Auth, RLS), react-markdown + remark-gfm + remark-math + rehype-highlight + rehype-katex.

## Routes
| Access | Path |
| --- | --- |
| Public | `/` (landing), `/login`, `/signup`, `/auth/callback`, `/disabled` |
| Signed in | `/chat`, `/chat/:chatId`, `/settings/profile`, `/settings/connections`, `/settings/models` |
| Admin | `/admin/users`, `/admin/connections` |

Signed-in routes live under `src/routes/_authenticated/` (client-side gate that also redirects disabled accounts to `/disabled`). Admin routes live under `src/routes/_authenticated/admin/` and redirect non-admins to `/chat`.

## Database (applied)
- `profiles` — display name, avatar, `is_disabled` (only admins can change it; enforced by trigger).
- `user_roles` + `app_role` enum (`admin`, `user`) and `has_role()` security-definer function.
- A trigger creates a profile and a `user` role for each new sign-up.
- RLS is on for every table. Users read and update only their own rows; admins can read all rows.

## Security rules
- Never put AI provider keys in frontend code or browser storage. They are stored as server secrets and used only by server functions.
- The service-role key never reaches the browser. Load it only inside server handlers, after an authorization check.
- All AI provider calls go through server functions (`createServerFn`), never directly from the browser.
- Route guards only protect the UI. Every server function that touches private data must check auth (and admin role) itself.
- Strict TypeScript, with no `any`.

## Environment / secrets
Managed automatically by Lovable Cloud: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only).

Future provider secrets (added in later phases, server-side only):
```
OPENAI_API_KEY=<set via secrets, never in code>
ANTHROPIC_API_KEY=<set via secrets, never in code>
```

## Approval workflow
- **The first registered user becomes admin and is approved automatically.** A database lock makes this race-safe.
- **Every later user gets the `user` role and must be approved by an admin.** Until then they see "awaiting administrator approval" at `/disabled`.
- **Disabled users** are sent to `/disabled` with a "contact an administrator" message.
- **Database rules:** `is_admin()` and `is_active_approved_user()` are security-definer functions with a fixed search_path. A trigger blocks non-admins from changing `is_approved` or `is_disabled`. Only admins can add or remove roles, and they cannot remove their own.
- **Approving users:** there's no admin screen yet. Run this in the backend SQL editor:
  `update public.profiles set is_approved = true where id = '<user-id>';`

## Google OAuth
Google sign-in works out of the box with managed credentials. To use your own Google client, go to Cloud → Users → Auth Settings → Sign In Methods → Google.

## Manual setup
1. Optional: turn on leaked-password protection under Cloud → Users → Auth Settings → Email.

## Admin user management (/admin/users)
Privileged mutations run in authenticated server functions (`src/lib/admin-users.functions.ts`) that verify the caller's session token and call `is_admin()`, then invoke security-definer SQL functions (`admin_set_approval`, `admin_set_disabled`, `admin_set_admin`) which re-check `is_admin()`, block self-disable, and block removing the last admin (advisory lock). Errors are mapped to friendly messages. Roles stay exclusively in `user_roles`.

### Manual testing
1. **First admin:** sign up at `/signup` with account A. The first account is automatically admin + approved. Open `/admin/users` — you see yourself as Admin/Approved.
2. **Second user:** in a private window, sign up with account B. After sign-in B lands on `/disabled?reason=pending`.
3. **Approve:** as A, click **Approve** on B. B clicks "Check again" and reaches `/chat`.
4. **Disable/enable:** as A, **Disable** B → B is sent to `/disabled` on next navigation. **Enable** restores access. Note A's own Disable button is blocked, and removing A's admin role while A is the only admin fails with a friendly message.
5. **Normal user blocked:** as B, open `/admin/users` → redirected to `/chat`. Calling the server functions directly as B returns "You need administrator access to do that."

## Provider connections
- Table `connections` (personal or global). RLS: owners read their personal rows; approved active users read global rows. Clients have column-level SELECT on safe metadata only — `encrypted_api_key` is not selectable, and clients have no insert/update/delete rights.
- Writes go through authenticated server functions `upsertConnection` / `deleteConnection` (`src/lib/connections.functions.ts`): verify session token + `is_active_approved_user()`, `is_admin()` for global scope, Zod validation, AES-256-GCM encryption (`v1:<iv>:<ciphertext>`), masked hint `…abcd`.
- Secret `CONNECTION_ENCRYPTION_KEY` (generated, already set). Rotating it makes existing keys undecryptable — users must re-enter them.
- Custom base URLs (OpenAI-compatible only) must be HTTPS public hosts; localhost/private/link-local/metadata addresses are rejected unless the server secret `ALLOW_LOCAL_PROVIDER_ENDPOINTS=true` is set (development only). Standard providers use server-side default URLs.

## Connection testing & model discovery
- Server functions `testConnection` / `fetchConnectionModels` (`src/lib/models.functions.ts`): verify session + `is_active_approved_user()` + `can_manage_connection()`, decrypt the key server-side only, call the provider with a 15s timeout and no redirects, and map failures to: Connected, Unauthorized key, Invalid endpoint, Provider timed out, Rate limited, Provider unavailable. Raw provider responses are never returned.
- Endpoints: OpenAI/OpenAI-compatible `GET /models`, OpenRouter `GET /models` (test uses `/key`), Anthropic `GET /v1/models`, Gemini `GET /v1beta/models`.
- `models` table: upserted per connection; existing `enabled` values are preserved. Only reliable fields are stored (context window/capabilities where the provider supplies them). Users can only update `enabled`, via RLS (owner for personal, admin for global).

## Chats & messages
- Tables `chats` and `messages` with RLS: users read/write only their own chats and those chats' messages (and only while approved/active); admins can read all via `is_admin()`. No anonymous access.
- Triggers keep `chats.updated_at` current on settings changes and on any message insert/update.
- Chat CRUD runs from the browser client under RLS (`src/lib/chats.ts`). Sending/streaming is not implemented yet.

## Streaming chat completion
- `POST /api/chat-completion` (`src/routes/api/chat-completion.ts`) is the only code path that calls AI providers for chat. It verifies the bearer token, active/approved status, chat ownership, model visibility/enabled connection; applies a 20 responses/min per-user limit, one in-flight stream per chat, prompt-size limits, and `requestId` idempotency (`messages.client_request_id`).
- Adapters (`src/lib/chat-stream.server.ts`): OpenAI/OpenRouter/OpenAI-compatible Chat Completions, Anthropic Messages, Gemini `streamGenerateContent`. 60s connect timeout and 120s idle timeout. Emits SSE `delta`, `complete`, `error` with friendly messages only.
- Lifecycle: user message saved → assistant row `streaming` → content accumulated server-side → `complete` / `stopped` / `error`. Stop also saves the partial text from the browser as a fallback.
