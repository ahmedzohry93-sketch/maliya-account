CREATE TYPE public.asset_status AS ENUM ('draft','running','fully_depreciated','disposed');
CREATE TYPE public.depreciation_method AS ENUM ('straight_line','declining_balance','none');

CREATE TABLE public.fixed_assets (
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

CREATE TABLE public.asset_depreciations (
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

INSERT INTO public.permissions (key, label, category, description) VALUES
  ('assets.view', 'عرض الأصول الثابتة', 'assets', 'الاطلاع على سجل الأصول الثابتة'),
  ('assets.manage', 'إدارة الأصول الثابتة', 'assets', 'إضافة وتعديل وحذف الأصول'),
  ('assets.depreciate', 'ترحيل الإهلاك', 'assets', 'احتساب وترحيل أقساط الإهلاك')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.name = 'Admin' AND p.key IN ('assets.view','assets.manage','assets.depreciate')
ON CONFLICT DO NOTHING;