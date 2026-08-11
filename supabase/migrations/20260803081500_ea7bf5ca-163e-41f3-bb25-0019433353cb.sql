-- Permissions
INSERT INTO public.permissions (key, label, category, description) VALUES
  ('backup.view', 'عرض النسخ الاحتياطية', 'backup', 'View backup history'),
  ('backup.create', 'إنشاء نسخة احتياطية', 'backup', 'Create and delete backups'),
  ('backup.restore', 'الاستعادة من نسخة', 'backup', 'Restore data from a backup')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.name = 'Admin' AND p.key IN ('backup.view','backup.create','backup.restore')
ON CONFLICT DO NOTHING;

-- Backup jobs
CREATE TABLE public.backup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual','scheduled')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  file_name text,
  storage_path text,
  size_bytes bigint NOT NULL DEFAULT 0,
  tables_count integer NOT NULL DEFAULT 0,
  rows_count integer NOT NULL DEFAULT 0,
  files_count integer NOT NULL DEFAULT 0,
  destination text NOT NULL DEFAULT 'storage',
  error text,
  restored_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_jobs TO authenticated;
GRANT ALL ON public.backup_jobs TO service_role;
ALTER TABLE public.backup_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backup_jobs_select" ON public.backup_jobs FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'backup.view'));
CREATE POLICY "backup_jobs_insert" ON public.backup_jobs FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'backup.create'));
CREATE POLICY "backup_jobs_update" ON public.backup_jobs FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'backup.create'));
CREATE POLICY "backup_jobs_delete" ON public.backup_jobs FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'backup.create'));

CREATE TRIGGER set_backup_jobs_updated_at BEFORE UPDATE ON public.backup_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backup settings (singleton)
CREATE TABLE public.backup_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_enabled boolean NOT NULL DEFAULT false,
  run_hour_utc integer NOT NULL DEFAULT 2 CHECK (run_hour_utc BETWEEN 0 AND 23),
  retention_count integer NOT NULL DEFAULT 14 CHECK (retention_count BETWEEN 1 AND 365),
  include_files boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.backup_settings TO authenticated;
GRANT ALL ON public.backup_settings TO service_role;
ALTER TABLE public.backup_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backup_settings_select" ON public.backup_settings FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'backup.view'));
CREATE POLICY "backup_settings_insert" ON public.backup_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'backup.create'));
CREATE POLICY "backup_settings_update" ON public.backup_settings FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'backup.create'));

CREATE TRIGGER set_backup_settings_updated_at BEFORE UPDATE ON public.backup_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.backup_settings (daily_enabled) VALUES (false);