ALTER TABLE public.models ADD COLUMN IF NOT EXISTS max_output_tokens integer, ADD COLUMN IF NOT EXISTS supports_structured_output boolean, ADD COLUMN IF NOT EXISTS supports_tool_calls boolean;

CREATE TABLE public.code_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id uuid REFERENCES public.chats(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Untitled project',
  framework text NOT NULL DEFAULT 'react_vite' CHECK (framework IN ('static_html','react_vite')),
  selected_model_id uuid REFERENCES public.models(id) ON DELETE SET NULL,
  preview_status text NOT NULL DEFAULT 'idle' CHECK (preview_status IN ('idle','building','ready','error')),
  preview_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.code_projects(id) ON DELETE CASCADE,
  path text NOT NULL,
  content text NOT NULL DEFAULT '',
  language text,
  file_type text NOT NULL DEFAULT 'source' CHECK (file_type IN ('source','config','style','asset_reference')),
  is_entry_file boolean NOT NULL DEFAULT false,
  created_by text NOT NULL CHECK (created_by IN ('user','assistant','system')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, path)
);
CREATE TABLE public.project_file_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_file_id uuid NOT NULL REFERENCES public.project_files(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.code_projects(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  content text NOT NULL,
  change_source text NOT NULL CHECK (change_source IN ('user','assistant','restore')),
  change_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_file_id, version_number)
);
CREATE TABLE public.code_generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.code_projects(id) ON DELETE CASCADE,
  chat_id uuid REFERENCES public.chats(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  model_id uuid REFERENCES public.models(id) ON DELETE SET NULL,
  instruction text NOT NULL,
  plan text,
  output text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','planning','streaming','awaiting_review','applying','complete','stopped','failed')),
  finish_reason text,
  continuation_count integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.code_change_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_run_id uuid NOT NULL REFERENCES public.code_generation_runs(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.code_projects(id) ON DELETE CASCADE,
  changes jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','rejected','partially_applied','superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX code_projects_user_updated_idx ON public.code_projects(user_id, updated_at DESC);
CREATE INDEX project_files_project_path_idx ON public.project_files(project_id, path);
CREATE INDEX project_file_versions_file_ver_idx ON public.project_file_versions(project_file_id, version_number DESC);
CREATE INDEX code_generation_runs_project_created_idx ON public.code_generation_runs(project_id, created_at DESC);
CREATE INDEX code_change_sets_run_idx ON public.code_change_sets(generation_run_id);

CREATE OR REPLACE FUNCTION public.owns_code_project(_project_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.code_projects WHERE id = _project_id AND user_id = auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.owns_code_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_code_project(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.code_projects_validate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.chat_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.chats WHERE id = NEW.chat_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Project chat must belong to the project owner';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER code_projects_validate BEFORE INSERT OR UPDATE ON public.code_projects FOR EACH ROW EXECUTE FUNCTION public.code_projects_validate();

GRANT SELECT ON public.code_projects, public.project_files, public.project_file_versions, public.code_generation_runs, public.code_change_sets TO authenticated;
GRANT ALL ON public.code_projects, public.project_files, public.project_file_versions, public.code_generation_runs, public.code_change_sets TO service_role;

ALTER TABLE public.code_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_file_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_generation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_change_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own code projects" ON public.code_projects FOR SELECT TO authenticated USING (user_id = auth.uid() AND public.is_active_approved_user());
CREATE POLICY "Admins read all code projects" ON public.code_projects FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Users read own project files" ON public.project_files FOR SELECT TO authenticated USING (public.owns_code_project(project_id) AND public.is_active_approved_user());
CREATE POLICY "Admins read all project files" ON public.project_files FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Users read own file versions" ON public.project_file_versions FOR SELECT TO authenticated USING (public.owns_code_project(project_id) AND public.is_active_approved_user());
CREATE POLICY "Admins read all file versions" ON public.project_file_versions FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Users read own code runs" ON public.code_generation_runs FOR SELECT TO authenticated USING (user_id = auth.uid() AND public.is_active_approved_user());
CREATE POLICY "Admins read all code runs" ON public.code_generation_runs FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Users read own change sets" ON public.code_change_sets FOR SELECT TO authenticated USING (public.owns_code_project(project_id) AND public.is_active_approved_user());
CREATE POLICY "Admins read all change sets" ON public.code_change_sets FOR SELECT TO authenticated USING (public.is_admin());