# Block 16 — Agent Mode, Secure Tool Gateway and self-hosted Agent Runner

## What stays the same
- Normal chat: the existing chat route, CodeCraft connection, model picker, streaming, edit/regenerate, attachments, images, files and the Build workspace stay as they are. Nothing about the CodeCraft key or address changes.
- The Agent feature is an addition. It is used only when the new Agent toggle is on.

## What the user will see
1. **Agent toggle** in the chat composer. If the selected model can't do native tool calling, the toggle shows the required message and won't run.
2. **Tool cards** in the conversation (Searching the web, Reading package.json, Running npm run build...) showing status, time taken, an expandable cleaned-up result, and Retry.
3. **Approval dialog** showing the tool, a summary, the workspace, the path or command, the risk level, and Allow once / Deny / "Always allow in this workspace" (low and medium risk only).
4. **Sources** under answers that used web results. Only real links are shown.
5. **Settings → Agent Tools & Workspace**: runner status, pairing (a one-time code), workspace selection and default, permission per tool group, auto-continue, Agent default, and "Stop all dev servers".
6. When no runner is connected, the app clearly shows **"Runner not connected"**. No tool pretends to work.

## How it works
```text
Chat UI --(Agent on)--> /api/agent-completion (new route)
   -> CodeCraft (OpenAI-compatible, native `tools` + `tool_calls`)
   -> check the tool name and arguments with Zod, then check permissions
   -> if approval is needed: pause and wait for the user's decision
   -> add the task to agent_tasks <- the runner fetches it over outbound HTTPS with a token
   -> the runner returns a structured result -> clean it and save it -> send it back to CodeCraft
   -> repeat until the final answer or a limit -> stream the answer
```
- The runner only makes outbound connections, by polling. The user's computer never has to be reachable from the internet.
- Limits: steps (default 20, max 30), tool calls per turn, time budget, and output size. If the same tool call repeats, the run stops with "Agent execution limit reached". Progress is kept, and Continue is offered.

## Agent Runner (new `agent-runner/` folder, Python FastAPI-style worker)
- Pairing: the app creates a one-time code. The runner exchanges it for a runner token. The backend stores only a hash of that token. Each task gets its own short-lived task ID.
- Workspace roots come from the runner's `APPROVED_WORKSPACE_ROOTS`. Every path is resolved to its real location and must stay inside the root. Traversal, symlink escapes, device files and system folders are rejected. `.env*`, keys, `.ssh` and credential files are denied.
- Tools: web_search (`ddgs`, behind a SearchProvider -> DuckDuckGoProvider structure), web_fetch (checks every address and every redirect against private ranges, limits size and timeout, extracts readable text with `trafilatura`), list/read/write (backup first)/edit/delete/mkdir/move/search_files, execute_command (no shell, a list of allowed programs, sudo/su/disk/etc. always denied, a stripped-down environment, timeout and process-group kill, output cut short), git status/diff/log/branch/checkout/add/commit (push is not offered as a tool), and dev servers start/status/stop/logs (a per-workspace limit, cleanup when the runner exits).
- Includes a Dockerfile (non-root user, only the workspace folder mounted), `.env.example` with placeholders, and a README setup guide.

## Technical details
- **Migration**: the 7 required tables as specified, plus `agent_runner_credentials` (token hash, pairing code hash, with no access from browser roles) and `agent_tasks` (the queue, server-only). All tables use owner-only RLS policies. Browser roles get SELECT on their own rows only. Every write goes through server functions or the admin client after an auth check. Admins can read through `is_admin()`.
- **Server**: `agent-tools.ts` (tool schemas, risk classes, permission evaluation), `agent-orchestrator.server.ts` (the loop), `agent-relay.server.ts` (add a task and wait for its result), `agent.functions.ts` (pairing, workspaces, permissions, approvals, stopping servers), `routes/api/agent-completion.ts`, and `routes/api/public/runner/*` (register, heartbeat, poll, result, workspaces, each checked against the token hash).
- **Provider**: a small new tools-capable streaming function for OpenAI-compatible connections such as CodeCraft. `streamChat` itself is not changed. A model counts as tool-capable when the provider reports it, or after a one-time real tool-call probe whose result is saved on the model.
- **Preview proxy**: a dev server's preview is shown only as status and logs. A public proxy to localhost ports is not built. This is documented as a limitation.
- **Order of work**: migration -> runner API and pairing -> runner code -> tool schemas and orchestrator -> chat UI (toggle, cards, approvals, sources) -> Settings page -> README and AGENTS.md -> tests (CodeCraft chat unchanged, tool-capability probe, pairing flow, SSRF and path tests on the runner code run locally in the sandbox).
- **Limitation**: the runner can't run inside the hosted app. File, terminal, git and dev-server tools only work after the user starts the runner on their own computer or server.
