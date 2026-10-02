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
