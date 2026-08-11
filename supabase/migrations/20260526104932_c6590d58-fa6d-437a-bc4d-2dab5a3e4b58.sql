
-- ============== PROFILES ==============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============== ROLES & PERMISSIONS ==============
CREATE TABLE public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT
);
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.role_permissions (
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============== SECURITY DEFINER FUNCTIONS ==============
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id AND p.key = _permission_key
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id AND r.name = 'Admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id UUID)
RETURNS TABLE(key TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT p.key
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON rp.role_id = ur.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ur.user_id = _user_id;
$$;

-- ============== ACCOUNTS (Chart of Accounts) ==============
CREATE TYPE public.account_type AS ENUM ('asset','liability','equity','revenue','expense');

CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type public.account_type NOT NULL,
  parent_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- ============== JOURNAL ==============
CREATE TYPE public.journal_status AS ENUM ('draft','posted','cancelled');

CREATE SEQUENCE public.journal_entry_no_seq START 1;

CREATE TABLE public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_no INTEGER NOT NULL UNIQUE DEFAULT nextval('public.journal_entry_no_seq'),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  reference TEXT,
  status public.journal_status NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id),
  debit NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  description TEXT,
  line_order INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_journal_lines_entry ON public.journal_lines(entry_id);
CREATE INDEX idx_journal_lines_account ON public.journal_lines(account_id);

-- ============== PARTNERS ==============
CREATE TYPE public.partner_type AS ENUM ('customer','supplier','both');

CREATE TABLE public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  type public.partner_type NOT NULL DEFAULT 'customer',
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_number TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

-- ============== AUDIT LOG ==============
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- ============== RLS POLICIES ==============

-- profiles
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin(auth.uid()));
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE
  USING (auth.uid() = id);
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- roles (readable by all authed; managed by admin)
CREATE POLICY "roles_select_authed" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles_admin_all" ON public.roles FOR ALL
  USING (public.has_permission(auth.uid(), 'roles.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'roles.manage'));

-- permissions (readable by all authed; immutable from app)
CREATE POLICY "permissions_select_authed" ON public.permissions FOR SELECT TO authenticated USING (true);

-- role_permissions
CREATE POLICY "rp_select_authed" ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "rp_admin_all" ON public.role_permissions FOR ALL
  USING (public.has_permission(auth.uid(), 'roles.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'roles.manage'));

-- user_roles
CREATE POLICY "ur_select_authed" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "ur_admin_all" ON public.user_roles FOR ALL
  USING (public.has_permission(auth.uid(), 'users.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'users.manage'));

-- accounts
CREATE POLICY "accounts_view" ON public.accounts FOR SELECT
  USING (public.has_permission(auth.uid(), 'accounts.view'));
CREATE POLICY "accounts_insert" ON public.accounts FOR INSERT
  WITH CHECK (public.has_permission(auth.uid(), 'accounts.create'));
CREATE POLICY "accounts_update" ON public.accounts FOR UPDATE
  USING (public.has_permission(auth.uid(), 'accounts.edit'));
CREATE POLICY "accounts_delete" ON public.accounts FOR DELETE
  USING (public.has_permission(auth.uid(), 'accounts.delete'));

-- journal_entries
CREATE POLICY "je_view" ON public.journal_entries FOR SELECT
  USING (public.has_permission(auth.uid(), 'journal.view'));
CREATE POLICY "je_insert" ON public.journal_entries FOR INSERT
  WITH CHECK (public.has_permission(auth.uid(), 'journal.create'));
CREATE POLICY "je_update" ON public.journal_entries FOR UPDATE
  USING (public.has_permission(auth.uid(), 'journal.edit') OR public.has_permission(auth.uid(), 'journal.approve'));
CREATE POLICY "je_delete" ON public.journal_entries FOR DELETE
  USING (public.has_permission(auth.uid(), 'journal.delete'));

-- journal_lines
CREATE POLICY "jl_view" ON public.journal_lines FOR SELECT
  USING (public.has_permission(auth.uid(), 'journal.view'));
CREATE POLICY "jl_insert" ON public.journal_lines FOR INSERT
  WITH CHECK (public.has_permission(auth.uid(), 'journal.create'));
CREATE POLICY "jl_update" ON public.journal_lines FOR UPDATE
  USING (public.has_permission(auth.uid(), 'journal.edit'));
CREATE POLICY "jl_delete" ON public.journal_lines FOR DELETE
  USING (public.has_permission(auth.uid(), 'journal.delete') OR public.has_permission(auth.uid(), 'journal.edit'));

-- partners
CREATE POLICY "partners_view" ON public.partners FOR SELECT
  USING (public.has_permission(auth.uid(), 'partners.view'));
CREATE POLICY "partners_insert" ON public.partners FOR INSERT
  WITH CHECK (public.has_permission(auth.uid(), 'partners.create'));
CREATE POLICY "partners_update" ON public.partners FOR UPDATE
  USING (public.has_permission(auth.uid(), 'partners.edit'));
CREATE POLICY "partners_delete" ON public.partners FOR DELETE
  USING (public.has_permission(auth.uid(), 'partners.delete'));

-- audit_logs (admins/audit viewers can read; inserts from server-side only)
CREATE POLICY "audit_view" ON public.audit_logs FOR SELECT
  USING (public.has_permission(auth.uid(), 'audit.view'));
CREATE POLICY "audit_insert_self" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============== updated_at TRIGGER ==============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_accounts_updated BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_je_updated BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_partners_updated BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== handle_new_user: create profile + grant Admin to first user ==============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_count INTEGER;
  v_admin_role UUID;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (id) DO NOTHING;

  SELECT COUNT(*) INTO v_user_count FROM auth.users;
  IF v_user_count <= 1 THEN
    SELECT id INTO v_admin_role FROM public.roles WHERE name = 'Admin' LIMIT 1;
    IF v_admin_role IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id) VALUES (NEW.id, v_admin_role)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============== SEED: permissions, default roles ==============
INSERT INTO public.permissions (key, label, category) VALUES
  ('accounts.view','عرض شجرة الحسابات','الحسابات'),
  ('accounts.create','إضافة حساب','الحسابات'),
  ('accounts.edit','تعديل حساب','الحسابات'),
  ('accounts.delete','حذف حساب','الحسابات'),
  ('journal.view','عرض قيود اليومية','القيود'),
  ('journal.create','إضافة قيد','القيود'),
  ('journal.edit','تعديل قيد','القيود'),
  ('journal.delete','حذف قيد','القيود'),
  ('journal.approve','اعتماد قيد','القيود'),
  ('ledger.view','عرض دفتر الأستاذ','التقارير'),
  ('trial_balance.view','عرض ميزان المراجعة','التقارير'),
  ('reports.view','عرض التقارير المالية','التقارير'),
  ('partners.view','عرض العملاء والموردين','الأطراف'),
  ('partners.create','إضافة طرف','الأطراف'),
  ('partners.edit','تعديل طرف','الأطراف'),
  ('partners.delete','حذف طرف','الأطراف'),
  ('users.manage','إدارة المستخدمين','الإدارة'),
  ('roles.manage','إدارة الأدوار والصلاحيات','الإدارة'),
  ('audit.view','عرض سجل التدقيق','الإدارة');

INSERT INTO public.roles (name, description, is_system) VALUES
  ('Admin','مدير النظام - كل الصلاحيات', true),
  ('Accountant','محاسب - إدارة القيود والحسابات', true),
  ('Viewer','مشاهد - عرض فقط', true);

-- Admin = all
INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT (SELECT id FROM public.roles WHERE name='Admin'), id FROM public.permissions;

-- Accountant = most operational
INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT (SELECT id FROM public.roles WHERE name='Accountant'), id FROM public.permissions
  WHERE key IN ('accounts.view','accounts.create','accounts.edit',
                'journal.view','journal.create','journal.edit',
                'ledger.view','trial_balance.view','reports.view',
                'partners.view','partners.create','partners.edit');

-- Viewer = view only
INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT (SELECT id FROM public.roles WHERE name='Viewer'), id FROM public.permissions
  WHERE key IN ('accounts.view','journal.view','ledger.view','trial_balance.view','reports.view','partners.view');
