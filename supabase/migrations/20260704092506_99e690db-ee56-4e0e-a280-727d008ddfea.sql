
INSERT INTO public.permissions (key, label, category, description) VALUES
  ('invoices.view','عرض الفواتير','invoices','View invoices'),
  ('invoices.create','إنشاء الفواتير','invoices','Create invoices'),
  ('invoices.edit','تعديل الفواتير','invoices','Edit invoices'),
  ('invoices.delete','حذف الفواتير','invoices','Delete invoices'),
  ('payments.view','عرض الدفعات','payments','View payments'),
  ('payments.create','إنشاء الدفعات','payments','Create payments'),
  ('payments.edit','تعديل الدفعات','payments','Edit payments'),
  ('payments.delete','حذف الدفعات','payments','Delete payments')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name = 'Admin' AND p.key IN (
  'invoices.view','invoices.create','invoices.edit','invoices.delete',
  'payments.view','payments.create','payments.edit','payments.delete')
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

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id AND p.key = _permission_key
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id uuid)
RETURNS TABLE(key text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT DISTINCT p.key FROM public.user_roles ur
  JOIN public.role_permissions rp ON rp.role_id = ur.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ur.user_id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id AND r.name = 'Admin'
  );
$$;
