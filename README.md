# Unified AI Workspace

A secure multi-provider AI chat workspace with encrypted provider connections, real model discovery, streaming conversations, access controls, and a unified responsive interface.

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

## Performance decisions
- TanStack Start's file-based route splitting keeps settings and admin pages out of the initial public and chat bundles. Homepage sections below the first viewport are loaded with `React.lazy` and a stable skeleton fallback.
- The previous full-screen remote video and poster were removed. The homepage now uses lightweight SVG and CSS interface visuals, including one reusable SVG brand mark and SVG favicon.
- TanStack Query uses a 30-second freshness window, five-minute garbage collection, one retry, and no automatic focus refetch. Existing mutations still invalidate their affected query keys.
- Chat history is bounded to the 200 most recently updated active chats, using the existing `(user_id, is_archived, updated_at desc)` index. Messages remain fetched only for the selected chat using the existing `(chat_id, created_at)` index.
- Streaming text updates are batched to the browser's animation frame. Stable markdown and message surfaces are memoized so completed content avoids unnecessary work during token delivery.
- Motion is short and purposeful, and the global reduced-motion rule disables non-essential animation and smooth scrolling when requested.
- No extra database indexes were added: the current chat, message, model, connection, and idempotency query shapes are already covered.

## Deployment readiness (Phase 1)

### Secrets
- `CONNECTION_ENCRYPTION_KEY` — already generated; AES-256-GCM key for provider keys. Never rotate without re-entering every connection key.
- `APP_ORIGIN` — optional, comma-separated extra origins (e.g. a custom domain) allowed to call `/api/chat-completion`. The app's own origin is always allowed; no CORS headers are sent, so there is never a wildcard.
- `ALLOW_LOCAL_PROVIDER_URLS` (or `ALLOW_LOCAL_PROVIDER_ENDPOINTS`) = `true` — local development only; allows http/localhost/private provider URLs. Never set in production.

### Google OAuth & redirect URLs
Google uses Lovable Cloud's managed credentials by default. To use your own: Cloud → Users → Auth Settings → Google, and add the callback URL shown there to your Google client. Allowed redirect URLs: your preview URL, published `*.lovable.app` URL and any custom domain, each with `/auth/callback` and `/reset-password`.

### Custom domain
After connecting a domain, add it to the auth redirect URLs and to `APP_ORIGIN`.

### First admin & approval
The first account to sign up becomes an approved admin. Everyone else waits on /disabled until an admin approves them in Admin → Users.

### Testing a provider
Settings → Connections → add a key → "Test connection" (expect "Connected") → "Fetch models" → pick the model in a chat.

### How key encryption works
Keys are encrypted on the server (AES-256-GCM, random IV, `v1:iv:ciphertext`) before storage. The `encrypted_api_key` column has no client grants, keys are decrypted only inside server handlers right before a provider call, and only a `…abcd` hint is ever returned.

### Phase 1 features
Auth (email + Google), approval workflow, roles, admin users, encrypted personal/shared connections, connection test, real model discovery, chat history, streaming chat with stop/regenerate/edit/delete, model selector, markdown/code/math, per-chat settings, command palette, themes.

### Deferred (Phase 2/3)
Compare mode, file uploads, RAG/knowledge, image generation, voice, branching/version history, usage/cost dashboards, account-deletion cleanup.

## File attachments (Block 10)

- **Bucket:** private `chat-attachments` (public access off, 50 MB per-object limit; project upload limit also 50 MB). No storage policies exist for browser roles, so objects are reachable only through server code.
- **Limit:** 50 MB (52,428,800 bytes) per file — checked in the browser, by the server before issuing an upload URL, after upload, by a table check, and by the bucket.
- **Flow:** `createAttachmentUpload` → short-lived signed upload URL scoped to `user/{userId}/{yyyy-mm}/{uuid}-{sanitized-name}` → direct browser upload with progress → `completeAttachmentUpload` verifies the object and saves metadata. Sending a message passes `attachmentIds`; `/api/chat-completion` checks ownership/chat/unlinked state and links them to the new user message.
- **Downloads:** only via `getAttachmentDownloadUrl`, which returns a 5-minute signed URL after an RLS-scoped ownership check. No permanent/public URLs.
- **Delete:** `deleteAttachment` removes the object and the row (owner only); attached files require confirmation.
- **Previews (allow-list):** PNG/JPEG/GIF/WebP/AVIF/BMP thumbnails; PDF as an open/download card (not embedded); TXT/MD/CSV as a 2 KB plain-text preview; MP4/WebM/Ogg video and common audio via native players. Everything else — including SVG, HTML, JS, executables and archives — is download-only and never rendered.
- **Limitations:** files are not sent to AI models yet; no malware scanning; signed URLs work for anyone holding them until they expire (5 min).

## AI image generation (Block 11)

- **Providers:** OpenAI Images API (`gpt-image-1`, `gpt-image-1-mini`, `dall-e-3`, `dall-e-2`), Stability AI (`stable-image-ultra`, `stable-image-core`, `sd3.5-large`, `sd3.5-large-turbo`, `sd3.5-medium` via `/v2beta/stable-image/generate/*`), and FLUX / Black Forest Labs (`flux-pro-1.1-ultra`, `flux-pro-1.1`, `flux-kontext-pro`, `flux-kontext-max` via `api.bfl.ai`, async polling).
- **Setup:** Settings → Connections → add an OpenAI, "Stability AI (images)" or "FLUX / Black Forest Labs (images)" connection, click **Test connection**, then **Fetch models**. Keys are encrypted like every other connection.
- **Capabilities:** a model is image-capable only when it matches the documented catalog in `src/lib/image-catalog.ts` (exact model id). Fetched models get `capabilities.image_generation`, `supported_sizes` / `supported_aspect_ratios` / `supported_qualities` / `supported_styles` / `supports_negative_prompt`. OpenAI-compatible endpoints are not marked image-capable (no reliable way to verify Images API support). Image models are hidden from the chat model picker.
- **Flow:** Image button or `/image prompt` → dialog → `generateImageJob` server function checks the account, chat ownership, model/connection access, options and rate limit, decrypts the key, calls the provider, downloads the result server-side (FLUX URLs restricted to `*.bfl.ai`), verifies it is a PNG/JPEG/WebP, and saves it to the private `chat-attachments` bucket as `attachment_type = 'generated_image'` linked to a new assistant message. `getImageJobStatus` reports status and fails jobs stuck >6 min; `cancelImageJob` stops FLUX polling and discards late results (these providers have no cancel API).
- **Storage:** generated images are private and shown/downloaded only through 5-minute signed URLs; provider URLs are never stored. `provider_job_id` is server-only (not granted to browser roles).
- **Rate limit:** 20 images per user per hour by default; set the `IMAGE_RATE_LIMIT_PER_HOUR` secret to change it. Max 2 concurrent jobs per user.
