
INSERT INTO public.permissions (key, label, category, description) VALUES
  ('products.view','عرض المنتجات','products','View products'),
  ('products.manage','إدارة المنتجات','products','Manage products and stock')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name = 'Admin' AND p.key IN ('products.view','products.manage')
ON CONFLICT DO NOTHING;

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
