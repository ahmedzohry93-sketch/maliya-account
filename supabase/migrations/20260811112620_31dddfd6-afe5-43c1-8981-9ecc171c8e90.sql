-- Fixed assets
DO $$ BEGIN CREATE TYPE public.asset_status AS ENUM ('draft','running','fully_depreciated','disposed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.depreciation_method AS ENUM ('straight_line','declining_balance','none'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.permissions (key, label, category, description) VALUES
  ('assets.view', 'عرض الأصول الثابتة', 'assets', 'الاطلاع على سجل الأصول الثابتة'),
  ('assets.manage', 'إدارة الأصول الثابتة', 'assets', 'إضافة وتعديل وحذف الأصول'),
  ('assets.depreciate', 'ترحيل الإهلاك', 'assets', 'احتساب وترحيل أقساط الإهلاك'),
  ('backup.view', 'عرض النسخ الاحتياطية', 'backup', 'View backup history'),
  ('backup.create', 'إنشاء نسخة احتياطية', 'backup', 'Create and delete backups'),
  ('backup.restore', 'الاستعادة من نسخة', 'backup', 'Restore data from a backup')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.name = 'Admin' AND p.key IN ('assets.view','assets.manage','assets.depreciate','backup.view','backup.create','backup.restore')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text,
  name text NOT NULL,
  category text,
  acquisition_date date NOT NULL DEFAULT CURRENT_DATE,
  in_service_date date,
  cost numeric NOT NULL DEFAULT 0,
  salvage_value numeric NOT NULL DEFAULT 0,
  useful_life_months integer NOT NULL DEFAULT 60,
  method public.depreciation_method NOT NULL DEFAULT 'straight_line',
  declining_rate numeric NOT NULL DEFAULT 0,
  status public.asset_status NOT NULL DEFAULT 'draft',
  asset_account_id uuid REFERENCES public.accounts(id),
  accum_dep_account_id uuid REFERENCES public.accounts(id),
  dep_expense_account_id uuid REFERENCES public.accounts(id),
  disposal_date date,
  disposal_amount numeric,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_assets TO authenticated;
GRANT ALL ON public.fixed_assets TO service_role;
ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assets_select" ON public.fixed_assets FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'assets.view'));
CREATE POLICY "assets_insert" ON public.fixed_assets FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'assets.manage'));
CREATE POLICY "assets_update" ON public.fixed_assets FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'assets.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'assets.manage'));
CREATE POLICY "assets_delete" ON public.fixed_assets FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'assets.manage') AND status = 'draft');
CREATE TRIGGER trg_fixed_assets_updated BEFORE UPDATE ON public.fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.asset_depreciations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  period_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  book_value_after numeric NOT NULL DEFAULT 0,
  posted boolean NOT NULL DEFAULT false,
  journal_entry_id uuid REFERENCES public.journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, period_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_depreciations TO authenticated;
GRANT ALL ON public.asset_depreciations TO service_role;
ALTER TABLE public.asset_depreciations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assetdep_select" ON public.asset_depreciations FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'assets.view'));
CREATE POLICY "assetdep_insert" ON public.asset_depreciations FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'assets.depreciate'));
CREATE POLICY "assetdep_update" ON public.asset_depreciations FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'assets.depreciate'))
  WITH CHECK (public.has_permission(auth.uid(), 'assets.depreciate'));
CREATE POLICY "assetdep_delete" ON public.asset_depreciations FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'assets.manage') AND posted = false);
CREATE TRIGGER trg_asset_dep_updated BEFORE UPDATE ON public.asset_depreciations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backups
CREATE TABLE IF NOT EXISTS public.backup_jobs (
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

CREATE TABLE IF NOT EXISTS public.backup_settings (
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

INSERT INTO public.backup_settings (daily_enabled)
SELECT false WHERE NOT EXISTS (SELECT 1 FROM public.backup_settings);