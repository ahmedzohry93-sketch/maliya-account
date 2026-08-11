import { supabase } from "@/integrations/supabase/client";

type InvoiceLine = {
  id?: string;
  product_id: string | null;
  description: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  cost_per_unit: number;
  line_order: number;
};

type InvoiceForPost = {
  id: string;
  type: "sale" | "purchase";
  invoice_no: number;
  partner_id: string;
  invoice_date: string;
  subtotal: number; // gross before discount
  discount_amount: number;
  tax: number;
  total: number; // net + tax
  partner_account_id: string | null;
  counter_account_id: string | null;
  tax_account_id: string | null;
  discount_account_id: string | null;
  cogs_account_id: string | null;
  inventory_account_id: string | null;
  reference: string | null;
  notes: string | null;
};

export async function postInvoiceToJournal(
  inv: InvoiceForPost,
  lines: InvoiceLine[] = [],
): Promise<string> {
  if (!inv.partner_account_id || !inv.counter_account_id) {
    throw new Error("يجب اختيار حساب الطرف وحساب المقابل قبل الترحيل");
  }
  if (inv.tax > 0 && !inv.tax_account_id) {
    throw new Error("يجب اختيار حساب الضريبة");
  }
  if (inv.discount_amount > 0 && !inv.discount_account_id) {
    throw new Error("يجب اختيار حساب الخصم المسموح به");
  }

  const isSale = inv.type === "sale";
  const desc =
    (isSale ? "فاتورة مبيعات " : "فاتورة مشتريات ") +
    `#${inv.invoice_no}` +
    (inv.reference ? ` - ${inv.reference}` : "");

  const { data: entry, error: e1 } = await supabase
    .from("journal_entries")
    .insert({
      entry_date: inv.invoice_date,
      description: desc,
      reference: inv.reference,
      status: "posted",
      entry_type: isSale ? "sales" : "purchases",
      approved_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (e1 || !entry) throw e1 ?? new Error("failed to create entry");

  const jl: Array<{
    entry_id: string;
    account_id: string;
    partner_id: string | null;
    debit: number;
    credit: number;
    description: string | null;
    line_order: number;
  }> = [];
  let order = 0;

  // Partner (AR debit on sale for total = net+tax; AP credit on purchase)
  jl.push({
    entry_id: entry.id,
    account_id: inv.partner_account_id,
    partner_id: inv.partner_id,
    debit: isSale ? inv.total : 0,
    credit: isSale ? 0 : inv.total,
    description: desc,
    line_order: order++,
  });

  // Discount side: sale => Dr Discount Allowed; purchase => Cr Discount Received
  if (inv.discount_amount > 0 && inv.discount_account_id) {
    jl.push({
      entry_id: entry.id,
      account_id: inv.discount_account_id,
      partner_id: null,
      debit: isSale ? inv.discount_amount : 0,
      credit: isSale ? 0 : inv.discount_amount,
      description: desc + " (خصم)",
      line_order: order++,
    });
  }

  // Revenue/Expense counter — GROSS subtotal (before discount)
  jl.push({
    entry_id: entry.id,
    account_id: inv.counter_account_id,
    partner_id: null,
    debit: isSale ? 0 : inv.subtotal,
    credit: isSale ? inv.subtotal : 0,
    description: desc,
    line_order: order++,
  });

  // Tax
  if (inv.tax > 0 && inv.tax_account_id) {
    jl.push({
      entry_id: entry.id,
      account_id: inv.tax_account_id,
      partner_id: null,
      debit: isSale ? 0 : inv.tax,
      credit: isSale ? inv.tax : 0,
      description: desc + " (ضريبة)",
      line_order: order++,
    });
  }

  const { error: e2 } = await supabase.from("journal_lines").insert(jl);
  if (e2) throw e2;

  // COGS entry (sale only, if both accounts provided and lines with cost)
  let cogsEntryId: string | null = null;
  if (isSale && inv.cogs_account_id && inv.inventory_account_id) {
    const totalCost = lines.reduce(
      (s, l) => s + Number(l.quantity) * Number(l.cost_per_unit || 0),
      0,
    );
    if (totalCost > 0) {
      const { data: c, error: ec } = await supabase
        .from("journal_entries")
        .insert({
          entry_date: inv.invoice_date,
          description: `تكلفة بضاعة مباعة - فاتورة #${inv.invoice_no}`,
          reference: inv.reference,
          status: "posted",
          entry_type: "sales",
          approved_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (ec || !c) throw ec ?? new Error("failed cogs entry");
      cogsEntryId = c.id;
      const { error: ecl } = await supabase.from("journal_lines").insert([
        {
          entry_id: c.id,
          account_id: inv.cogs_account_id,
          partner_id: null,
          debit: totalCost,
          credit: 0,
          description: `تكلفة بضاعة مباعة #${inv.invoice_no}`,
          line_order: 0,
        },
        {
          entry_id: c.id,
          account_id: inv.inventory_account_id,
          partner_id: null,
          debit: 0,
          credit: totalCost,
          description: `تكلفة بضاعة مباعة #${inv.invoice_no}`,
          line_order: 1,
        },
      ]);
      if (ecl) throw ecl;
    }
  }

  const { error: e3 } = await supabase
    .from("invoices")
    .update({
      status: "posted",
      journal_entry_id: entry.id,
      cogs_journal_entry_id: cogsEntryId,
    } as any)
    .eq("id", inv.id);
  // fallback: some deployments won't have cogs_journal_entry_id column
  if (e3) {
    const { error: e3b } = await supabase
      .from("invoices")
      .update({ status: "posted", journal_entry_id: entry.id })
      .eq("id", inv.id);
    if (e3b) throw e3b;
  }

  return entry.id;
}

/** Apply stock moves for an invoice's lines. Sale => negative, Purchase => positive. */
export async function applyStockForInvoice(
  invoiceId: string,
  invoiceDate: string,
  type: "sale" | "purchase",
  lines: InvoiceLine[],
) {
  const sign = type === "sale" ? -1 : 1;
  const moves = lines
    .filter((l) => l.product_id && Number(l.quantity) > 0)
    .map((l) => ({
      product_id: l.product_id!,
      invoice_id: invoiceId,
      move_date: invoiceDate,
      qty: sign * Number(l.quantity),
      unit_cost: Number(l.cost_per_unit || 0),
      notes: type === "sale" ? "بيع" : "شراء",
    }));
  if (moves.length === 0) return;
  const { error } = await supabase.from("stock_moves").insert(moves);
  if (error) throw error;

  // Update product stock_qty
  for (const m of moves) {
    const { data: p } = await supabase
      .from("products")
      .select("stock_qty")
      .eq("id", m.product_id)
      .single();
    if (p) {
      await supabase
        .from("products")
        .update({ stock_qty: Number(p.stock_qty) + m.qty })
        .eq("id", m.product_id);
    }
  }
}

/** Reverse stock moves previously recorded for an invoice. */
export async function reverseStockForInvoice(invoiceId: string) {
  const { data: moves } = await supabase
    .from("stock_moves")
    .select("id, product_id, qty")
    .eq("invoice_id", invoiceId);
  if (!moves || moves.length === 0) return;
  for (const m of moves) {
    const { data: p } = await supabase
      .from("products")
      .select("stock_qty")
      .eq("id", m.product_id)
      .single();
    if (p) {
      await supabase
        .from("products")
        .update({ stock_qty: Number(p.stock_qty) - Number(m.qty) })
        .eq("id", m.product_id);
    }
  }
  await supabase.from("stock_moves").delete().eq("invoice_id", invoiceId);
}

type PaymentForPost = {
  id: string;
  kind: "receipt" | "payment";
  payment_no: number;
  partner_id: string;
  payment_date: string;
  amount: number;
  cash_account_id: string;
  partner_account_id: string;
  reference: string | null;
};

export async function postPaymentToJournal(p: PaymentForPost): Promise<string> {
  const isReceipt = p.kind === "receipt";
  const desc =
    (isReceipt ? "إيصال قبض " : "إذن صرف ") +
    `#${p.payment_no}` +
    (p.reference ? ` - ${p.reference}` : "");

  const { data: entry, error: e1 } = await supabase
    .from("journal_entries")
    .insert({
      entry_date: p.payment_date,
      description: desc,
      reference: p.reference,
      status: "posted",
      entry_type: isReceipt ? "cash_receipt" : "cash_payment",
      approved_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (e1 || !entry) throw e1 ?? new Error("failed");

  const lines = [
    {
      entry_id: entry.id,
      account_id: isReceipt ? p.cash_account_id : p.partner_account_id,
      partner_id: isReceipt ? null : p.partner_id,
      debit: p.amount,
      credit: 0,
      description: desc,
      line_order: 0,
    },
    {
      entry_id: entry.id,
      account_id: isReceipt ? p.partner_account_id : p.cash_account_id,
      partner_id: isReceipt ? p.partner_id : null,
      debit: 0,
      credit: p.amount,
      description: desc,
      line_order: 1,
    },
  ];
  const { error: e2 } = await supabase.from("journal_lines").insert(lines);
  if (e2) throw e2;

  const { error: e3 } = await supabase
    .from("payments")
    .update({ journal_entry_id: entry.id, status: "posted" })
    .eq("id", p.id);
  if (e3) throw e3;

  return entry.id;
}

export async function unpostJournal(entryId: string | null) {
  if (!entryId) return;
  await supabase.from("journal_lines").delete().eq("entry_id", entryId);
  await supabase.from("journal_entries").delete().eq("id", entryId);
}

/**
 * Create a reversing entry for a posted journal entry.
 * Debits and credits are swapped; the original entry stays untouched (audit-safe).
 */
export async function createReversalEntry(entryId: string, note?: string): Promise<string> {
  const { data: original, error: e0 } = await supabase
    .from("journal_entries")
    .select("*, journal_lines(*)")
    .eq("id", entryId)
    .single();
  if (e0 || !original) throw e0 ?? new Error("Entry not found");

  const { data: last } = await supabase
    .from("journal_entries")
    .select("entry_no")
    .order("entry_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextNo = Number((last as { entry_no?: number } | null)?.entry_no ?? 0) + 1;

  const src = original as unknown as {
    entry_no: number;
    description: string | null;
    entry_type: string | null;
    journal_lines: {
      account_id: string;
      partner_id: string | null;
      debit: number;
      credit: number;
      description: string | null;
      line_order: number;
    }[];
  };

  const { data: entry, error: e1 } = await supabase
    .from("journal_entries")
    .insert({
      entry_no: nextNo,
      entry_date: new Date().toISOString().slice(0, 10),
      description: note ?? `قيد عكسي للقيد رقم ${src.entry_no}`,
      reference: `REV-${src.entry_no}`,
      entry_type: src.entry_type ?? "general",
      status: "posted",
    })
    .select("id")
    .single();
  if (e1 || !entry) throw e1 ?? new Error("Failed to create reversing entry");

  const lines = (src.journal_lines ?? []).map((l, i) => ({
    entry_id: entry.id,
    account_id: l.account_id,
    partner_id: l.partner_id,
    debit: Number(l.credit || 0),
    credit: Number(l.debit || 0),
    description: l.description,
    line_order: i,
  }));
  if (lines.length) {
    const { error: e2 } = await supabase.from("journal_lines").insert(lines);
    if (e2) throw e2;
  }
  return entry.id;
}
