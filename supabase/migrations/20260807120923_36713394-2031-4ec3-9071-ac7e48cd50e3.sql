-- 1) Soft delete + archive columns
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoices','payments','journal_entries','checks','recurring_obligations','fixed_assets','products','partners'] LOOP
    EXECUTE format('ALTER TABLE public.%I
      ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
      ADD COLUMN IF NOT EXISTS deleted_by uuid,
      ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS archived_at timestamptz,
      ADD COLUMN IF NOT EXISTS archived_by uuid', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (is_deleted, is_archived)', 'idx_'||t||'_active', t);
  END LOOP;
END $$;

-- 2) Audit log enrichment
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS old_value jsonb,
  ADD COLUMN IF NOT EXISTS new_value jsonb,
  ADD COLUMN IF NOT EXISTS device text,
  ADD COLUMN IF NOT EXISTS ip_address text;

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity, entity_id);

CREATE OR REPLACE FUNCTION public.log_audit(
  _action text,
  _entity text,
  _entity_id uuid,
  _details jsonb DEFAULT NULL::jsonb,
  _old_value jsonb DEFAULT NULL::jsonb,
  _new_value jsonb DEFAULT NULL::jsonb,
  _device text DEFAULT NULL::text,
  _ip_address text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, details, old_value, new_value, device, ip_address)
  VALUES (v_uid, _action, _entity, _entity_id, _details, _old_value, _new_value, _device, _ip_address);
END;
$function$;

-- 3) Common performance indexes
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON public.journal_lines (entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON public.journal_lines (account_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON public.journal_entries (entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_partner ON public.invoices (partner_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON public.invoices (invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON public.invoice_lines (invoice_id);
CREATE INDEX IF NOT EXISTS idx_stock_moves_product ON public.stock_moves (product_id);