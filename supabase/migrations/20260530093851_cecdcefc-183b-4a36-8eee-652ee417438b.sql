
-- Link journal lines to partners (customer/supplier)
ALTER TABLE public.journal_lines ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_journal_lines_partner_id ON public.journal_lines(partner_id);

-- Seed inventory + inventory adjustment accounts (idempotent)
INSERT INTO public.accounts (code, name, type) VALUES ('113', 'المخزون', 'asset')
  ON CONFLICT DO NOTHING;
INSERT INTO public.accounts (code, name, type) VALUES ('52', 'تسوية المخزون', 'expense')
  ON CONFLICT DO NOTHING;
