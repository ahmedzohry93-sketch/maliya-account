-- Company settings singleton
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

-- Seed one row so the UI always finds a record
INSERT INTO public.company_settings (name) VALUES ('My Company');

-- Storage policies for company-assets bucket
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