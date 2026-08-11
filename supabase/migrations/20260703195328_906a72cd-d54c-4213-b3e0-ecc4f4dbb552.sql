
-- Products
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  unit TEXT DEFAULT 'قطعة',
  sale_price NUMERIC(18,2) NOT NULL DEFAULT 0,
  cost_price NUMERIC(18,2) NOT NULL DEFAULT 0,
  stock_qty NUMERIC(18,3) NOT NULL DEFAULT 0,
  tracks_inventory BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all products" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Stock moves
CREATE TABLE public.stock_moves (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
  move_date DATE NOT NULL DEFAULT CURRENT_DATE,
  qty NUMERIC(18,3) NOT NULL,
  unit_cost NUMERIC(18,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_moves TO authenticated;
GRANT ALL ON public.stock_moves TO service_role;
ALTER TABLE public.stock_moves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all stock_moves" ON public.stock_moves FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_stock_moves_product ON public.stock_moves(product_id);
CREATE INDEX idx_stock_moves_invoice ON public.stock_moves(invoice_id);

-- Extend invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS discount_type TEXT NOT NULL DEFAULT 'amount' CHECK (discount_type IN ('amount','percent')),
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_account_id UUID REFERENCES public.accounts(id),
  ADD COLUMN IF NOT EXISTS cogs_account_id UUID REFERENCES public.accounts(id),
  ADD COLUMN IF NOT EXISTS inventory_account_id UUID REFERENCES public.accounts(id);

-- Extend invoice_lines
ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_per_unit NUMERIC(18,2) NOT NULL DEFAULT 0;

-- Seed helpful accounts (idempotent)
INSERT INTO public.accounts (code, name, type, parent_id, is_active)
SELECT '1203', 'خصم مسموح به', 'expense', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '1203');

INSERT INTO public.accounts (code, name, type, parent_id, is_active)
SELECT '54', 'تكلفة البضاعة المباعة', 'expense', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '54');
