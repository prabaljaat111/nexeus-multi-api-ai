CREATE TABLE public.agent_runners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','connected','offline','revoked')),
  runner_version text, platform text, last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agent_runner_credentials (
  runner_id uuid PRIMARY KEY REFERENCES public.agent_runners(id) ON DELETE CASCADE,
  pairing_code_hash text, pairing_expires_at timestamptz, token_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agent_runner_credentials_token_idx ON public.agent_runner_credentials(token_hash) WHERE token_hash IS NOT NULL;
CREATE UNIQUE INDEX agent_runner_credentials_pair_idx ON public.agent_runner_credentials(pairing_code_hash) WHERE pairing_code_hash IS NOT NULL;
CREATE TABLE public.agent_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  runner_id uuid NOT NULL REFERENCES public.agent_runners(id) ON DELETE CASCADE,
  name text NOT NULL, configured_root text NOT NULL, is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (runner_id, configured_root)
);
CREATE TABLE public.agent_tool_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.agent_workspaces(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  permission_mode text NOT NULL CHECK (permission_mode IN ('disabled','ask_every_time','auto_allow')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (user_id, workspace_id, tool_name)
);
CREATE TABLE public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id uuid REFERENCES public.chats(id) ON DELETE SET NULL,
  runner_id uuid REFERENCES public.agent_runners(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.agent_workspaces(id) ON DELETE SET NULL,
  model_id uuid REFERENCES public.models(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('queued','running','awaiting_approval','complete','stopped','failed')),
  step_count integer NOT NULL DEFAULT 0, error_message text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_runs_chat_idx ON public.agent_runs(chat_id, created_at);
CREATE TABLE public.agent_tool_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  step_number integer NOT NULL, tool_name text NOT NULL,
  safe_input jsonb NOT NULL DEFAULT '{}'::jsonb, safe_output jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('requested','awaiting_approval','running','complete','failed','denied')),
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_tool_steps_run_idx ON public.agent_tool_steps(agent_run_id, step_number);
CREATE TABLE public.agent_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  tool_step_id uuid NOT NULL REFERENCES public.agent_tool_steps(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_summary text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','approved','denied','expired')),
  always_allow boolean NOT NULL DEFAULT false,
  expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE TABLE public.agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id uuid NOT NULL REFERENCES public.agent_runners(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_step_id uuid REFERENCES public.agent_tool_steps(id) ON DELETE CASCADE,
  workspace_root text, tool_name text NOT NULL, args jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','claimed','complete','failed','expired')),
  result jsonb, expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  created_at timestamptz NOT NULL DEFAULT now(), claimed_at timestamptz, completed_at timestamptz
);
CREATE INDEX agent_tasks_queue_idx ON public.agent_tasks(runner_id, status, created_at);
CREATE TABLE public.managed_dev_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  runner_id uuid NOT NULL REFERENCES public.agent_runners(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.agent_workspaces(id) ON DELETE CASCADE,
  command_summary text NOT NULL, process_identifier text, local_port integer,
  status text NOT NULL CHECK (status IN ('starting','running','stopped','failed')),
  safe_preview_url text, started_at timestamptz, stopped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS agent_mode_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS agent_auto_continue boolean NOT NULL DEFAULT true;

GRANT SELECT ON public.agent_runners, public.agent_workspaces, public.agent_tool_permissions, public.agent_runs, public.agent_tool_steps, public.agent_approvals, public.managed_dev_servers TO authenticated;
GRANT ALL ON public.agent_runners, public.agent_runner_credentials, public.agent_workspaces, public.agent_tool_permissions, public.agent_runs, public.agent_tool_steps, public.agent_approvals, public.agent_tasks, public.managed_dev_servers TO service_role;
REVOKE ALL ON public.agent_runner_credentials, public.agent_tasks FROM anon, authenticated;

ALTER TABLE public.agent_runners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runner_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tool_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tool_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.managed_dev_servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own runners" ON public.agent_runners FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "own workspaces" ON public.agent_workspaces FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "own permissions" ON public.agent_tool_permissions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own runs" ON public.agent_runs FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "own steps" ON public.agent_tool_steps FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.agent_runs r WHERE r.id = agent_run_id AND (r.user_id = auth.uid() OR public.is_admin())));
CREATE POLICY "own approvals" ON public.agent_approvals FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own dev servers" ON public.managed_dev_servers FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());