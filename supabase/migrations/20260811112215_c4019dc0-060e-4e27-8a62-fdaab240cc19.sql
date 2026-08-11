INSERT INTO public.permissions (key, label, category, description) VALUES
  ('invoices.view','عرض الفواتير','invoices','View invoices'),
  ('invoices.create','إنشاء الفواتير','invoices','Create invoices'),
  ('invoices.edit','تعديل الفواتير','invoices','Edit invoices'),
  ('invoices.delete','حذف الفواتير','invoices','Delete invoices'),
  ('payments.view','عرض الدفعات','payments','View payments'),
  ('payments.create','إنشاء الدفعات','payments','Create payments'),
  ('payments.edit','تعديل الدفعات','payments','Edit payments'),
  ('payments.delete','حذف الدفعات','payments','Delete payments'),
  ('products.view','عرض المنتجات','products','View products'),
  ('products.manage','إدارة المنتجات','products','Manage products and stock')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name = 'Admin'
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "auth read invoices" ON public.invoices;
DROP POLICY IF EXISTS "auth write invoices" ON public.invoices;
DROP POLICY IF EXISTS "auth update invoices" ON public.invoices;
DROP POLICY IF EXISTS "auth delete invoices" ON public.invoices;

CREATE POLICY inv_view ON public.invoices FOR SELECT
  USING (public.has_permission(auth.uid(), 'invoices.view'));
CREATE POLICY inv_insert ON public.invoices FOR INSERT
  WITH CHECK (public.has_permission(auth.uid(), 'invoices.create'));
CREATE POLICY inv_update ON public.invoices FOR UPDATE
  USING ((public.has_permission(auth.uid(), 'invoices.edit') AND status = 'draft')
         OR public.has_permission(auth.uid(), 'journal.approve'))
  WITH CHECK (public.has_permission(auth.uid(), 'invoices.edit')
              OR public.has_permission(auth.uid(), 'journal.approve'));
CREATE POLICY inv_delete ON public.invoices FOR DELETE
  USING (public.has_permission(auth.uid(), 'invoices.delete') AND status = 'draft');

DROP POLICY IF EXISTS "auth all invoice_lines" ON public.invoice_lines;
CREATE POLICY il_view ON public.invoice_lines FOR SELECT
  USING (public.has_permission(auth.uid(), 'invoices.view'));
CREATE POLICY il_insert ON public.invoice_lines FOR INSERT
  WITH CHECK (public.has_permission(auth.uid(), 'invoices.create')
              OR public.has_permission(auth.uid(), 'invoices.edit'));
CREATE POLICY il_update ON public.invoice_lines FOR UPDATE
  USING (public.has_permission(auth.uid(), 'invoices.edit'));
CREATE POLICY il_delete ON public.invoice_lines FOR DELETE
  USING (public.has_permission(auth.uid(), 'invoices.edit')
         OR public.has_permission(auth.uid(), 'invoices.delete'));

DROP POLICY IF EXISTS "auth all payments" ON public.payments;
CREATE POLICY pay_view ON public.payments FOR SELECT
  USING (public.has_permission(auth.uid(), 'payments.view'));
CREATE POLICY pay_insert ON public.payments FOR INSERT
  WITH CHECK (public.has_permission(auth.uid(), 'payments.create'));
CREATE POLICY pay_update ON public.payments FOR UPDATE
  USING ((public.has_permission(auth.uid(), 'payments.edit') AND status = 'draft')
         OR public.has_permission(auth.uid(), 'journal.approve'))
  WITH CHECK (public.has_permission(auth.uid(), 'payments.edit')
              OR public.has_permission(auth.uid(), 'journal.approve'));
CREATE POLICY pay_delete ON public.payments FOR DELETE
  USING (public.has_permission(auth.uid(), 'payments.delete') AND status = 'draft');

DROP POLICY IF EXISTS je_delete ON public.journal_entries;
CREATE POLICY je_delete ON public.journal_entries FOR DELETE
  USING (public.has_permission(auth.uid(), 'journal.delete') AND status = 'draft');

DROP POLICY IF EXISTS je_update ON public.journal_entries;
CREATE POLICY je_update ON public.journal_entries FOR UPDATE
  USING ((public.has_permission(auth.uid(), 'journal.edit') AND status = 'draft')
         OR public.has_permission(auth.uid(), 'journal.approve'));

DROP POLICY IF EXISTS "auth all products" ON public.products;
CREATE POLICY prod_view ON public.products FOR SELECT
  USING (public.has_permission(auth.uid(), 'products.view')
         OR public.has_permission(auth.uid(), 'invoices.view'));
CREATE POLICY prod_insert ON public.products FOR INSERT
  WITH CHECK (public.has_permission(auth.uid(), 'products.manage'));
CREATE POLICY prod_update ON public.products FOR UPDATE
  USING (public.has_permission(auth.uid(), 'products.manage')
         OR public.has_permission(auth.uid(), 'invoices.create')
         OR public.has_permission(auth.uid(), 'invoices.edit'));
CREATE POLICY prod_delete ON public.products FOR DELETE
  USING (public.has_permission(auth.uid(), 'products.manage'));

DROP POLICY IF EXISTS "auth all stock_moves" ON public.stock_moves;
CREATE POLICY sm_view ON public.stock_moves FOR SELECT
  USING (public.has_permission(auth.uid(), 'products.view')
         OR public.has_permission(auth.uid(), 'invoices.view'));
CREATE POLICY sm_insert ON public.stock_moves FOR INSERT
  WITH CHECK (public.has_permission(auth.uid(), 'products.manage')
              OR public.has_permission(auth.uid(), 'invoices.create')
              OR public.has_permission(auth.uid(), 'invoices.edit'));
CREATE POLICY sm_update ON public.stock_moves FOR UPDATE
  USING (public.has_permission(auth.uid(), 'products.manage'));
CREATE POLICY sm_delete ON public.stock_moves FOR DELETE
  USING (public.has_permission(auth.uid(), 'products.manage')
         OR public.has_permission(auth.uid(), 'invoices.edit')
         OR public.has_permission(auth.uid(), 'invoices.delete'));

REVOKE INSERT ON public.audit_logs FROM authenticated;
DROP POLICY IF EXISTS audit_insert_self ON public.audit_logs;

CREATE OR REPLACE FUNCTION public.log_audit(
  _action text,
  _entity text,
  _entity_id uuid,
  _details jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, details)
  VALUES (v_uid, _action, _entity, _entity_id, _details);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id
      AND r.is_system = true
      AND r.name = 'Admin'
  );
$$;

DROP POLICY IF EXISTS roles_admin_all ON public.roles;
DROP POLICY IF EXISTS roles_update_manage ON public.roles;
DROP POLICY IF EXISTS roles_delete_manage ON public.roles;
DROP POLICY IF EXISTS roles_insert_manage ON public.roles;

CREATE POLICY roles_insert_manage ON public.roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'roles.manage') AND is_system = false);

CREATE POLICY roles_update_manage ON public.roles
  FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'roles.manage') AND is_system = false)
  WITH CHECK (public.has_permission(auth.uid(), 'roles.manage') AND is_system = false);

CREATE POLICY roles_delete_manage ON public.roles
  FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'roles.manage') AND is_system = false);

DROP POLICY IF EXISTS ur_select_authed ON public.user_roles;
CREATE POLICY ur_select_own_or_manage ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_permission(auth.uid(), 'users.manage'));

DROP POLICY IF EXISTS rp_select_authed ON public.role_permissions;
CREATE POLICY rp_select_manage ON public.role_permissions
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'roles.manage'));

CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id uuid)
RETURNS TABLE(key text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.key
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON rp.role_id = ur.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ur.user_id = _user_id
    AND (auth.uid() = _user_id OR public.has_permission(auth.uid(), 'users.manage'));
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id AND p.key = _permission_key
  );
$$;

CREATE TABLE public.company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'My Company',
  name_en TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  tax_number TEXT,
  logo_path TEXT,
  currency TEXT NOT NULL DEFAULT 'EGP',
  footer_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_settings_read_authed"
  ON public.company_settings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "company_settings_insert_admin"
  ON public.company_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_permission(auth.uid(), 'users.manage'));

CREATE POLICY "company_settings_update_admin"
  ON public.company_settings FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_permission(auth.uid(), 'users.manage'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_permission(auth.uid(), 'users.manage'));

CREATE POLICY "company_settings_delete_admin"
  ON public.company_settings FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_permission(auth.uid(), 'users.manage'));

CREATE TRIGGER company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.company_settings (name) VALUES ('My Company');

CREATE POLICY "company_assets_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'company-assets');

CREATE POLICY "company_assets_insert_admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'company-assets'
    AND (public.is_admin(auth.uid()) OR public.has_permission(auth.uid(), 'users.manage'))
  );

CREATE POLICY "company_assets_update_admin"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'company-assets'
    AND (public.is_admin(auth.uid()) OR public.has_permission(auth.uid(), 'users.manage'))
  );

CREATE POLICY "company_assets_delete_admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'company-assets'
    AND (public.is_admin(auth.uid()) OR public.has_permission(auth.uid(), 'users.manage'))
  );