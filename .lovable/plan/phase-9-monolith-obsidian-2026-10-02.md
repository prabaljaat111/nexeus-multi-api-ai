# Phase 9 — Monolith Obsidian

## Goal
Unify the public site, authentication screens, and signed-in workspace under one premium “Monolith Obsidian” identity while preserving every existing Phase 1 workflow, security rule, and database behavior.

## Build
- Create one reusable SVG brand mark and wordmark for the homepage, auth screens, app sidebar, mobile header, settings, and footer.
- Replace the Nexeus video page with a fast, single-page Unified AI Workspace homepage: navigation, product-first hero, truthful workspace preview, supported providers, implemented features, three-step workflow, security, final CTA, and footer anchors.
- Make public CTAs session-aware: signed-out users see Sign in/Get started; signed-in users can open the workspace.
- Carry the selected Monolith Obsidian composition into the app: crisp dark surfaces, compact controls, restrained cyan/indigo accenting, clearer hierarchy, stable empty/loading/error states, and an equally polished light theme.
- Refresh auth, sidebar, chat, connections, models, profile, and admin screens through shared tokens/components without changing their actions or permissions.
- Keep desktop density high and make tablet/mobile layouts touch-friendly, overflow-safe, and keyboard accessible.

## Performance
- Keep TanStack’s existing route-level code splitting for settings/admin pages and lazy-load homepage sections below the first viewport.
- Add sensible query freshness defaults and targeted cache updates while preserving explicit mutation invalidation.
- Batch streaming text updates to the display frame and memoize stable message/markdown rendering so completed messages do not re-render for every token.
- Keep chat history bounded and messages scoped to the selected chat; preserve existing indexed query shapes and add no unnecessary database index.
- Remove the large homepage video and remote poster entirely; use lightweight SVG/CSS product visuals and reduced-motion-safe transitions.

## Verification
- Check type/build diagnostics, console/runtime/network errors, and representative public, auth, chat, settings, models, admin, light/dark, desktop, and mobile views.
- Exercise the existing signed-in flow with the available session, including chat history, connection/model screens, and a real streaming conversation without exposing provider keys.
- Confirm no horizontal mobile overflow, one consistent logo, no unsupported feature claims, public `/`, and working CTA destinations.
- Add a README “Performance decisions” section describing only optimizations actually implemented and update the architecture note for the shared brand system.

## Scope guardrails
No uploads, image generation, document generation, RAG, compare mode, voice, or other Phase 2/3 features. No schema/RLS weakening, provider-key exposure, mock product data, or new standalone marketing routes.
