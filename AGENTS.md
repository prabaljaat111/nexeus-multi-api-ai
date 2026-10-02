<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Signed-in pages live under `src/routes/_authenticated/` (ssr:false gate, also redirects disabled profiles to /disabled); admin pages under `_authenticated/admin/` — so guards are centralized in layouts.
- Roles live only in `user_roles` and are checked via `has_role()` — prevents privilege escalation via profile edits.
- Admin mutations go through `requireSupabaseAuth` server functions calling security-definer `admin_set_*` SQL functions that re-check `is_admin()` — checks hold even if the UI is bypassed.
- `profiles.is_disabled` and `is_approved` are admin-only, enforced by a DB trigger; the signup trigger makes the first user admin under an advisory lock — RLS alone cannot restrict columns or serialize signups.
- AI provider calls and provider keys stay server-side in `createServerFn` handlers — keys must never reach the browser.
- The landing page's `nx` html class is applied only on `/` (inline script + effect) — its global CSS would otherwise break app pages.
- Theme preference is stored in localStorage key `uaw-theme` and applied pre-paint by an inline script — avoids theme flash.
