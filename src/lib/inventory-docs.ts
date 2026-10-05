import { supabase } from "@/integrations/supabase/client";

const r2 = (n: number) => Math.round(n * 100) / 100;

async function bumpStock(productId: string, delta: number) {
  const { data: p } = await supabase.from("products").select("stock_qty").eq("id", productId).single();
  if (p) await supabase.from("products").update({ stock_qty: Number(p.stock_qty) + delta }).eq("id", productId);
}

export async function mainWarehouseId(): Promise<string | null> {
  const { data } = await supabase.from("warehouses").select("id").order("created_at").limit(1).maybeSingle();
  return data?.id ?? null;
}

/* ---------------- Returns ---------------- */

export type ReturnLineInput = {
  original_line_id: string;
  product_id: string | null;
  description: string | null;
  quantity: number;
  unit_price: number;
  cost_per_unit: number;
};

/** Already-returned quantity per original invoice line (posted + draft returns). */
export async function returnedQtyByLine(invoiceId: string): Promise<Record<string, number>> {
  const { data } = await supabase
    .from("invoice_return_lines")
    .select("original_line_id, quantity, invoice_returns!inner(original_invoice_id)")
    .eq("invoice_returns.original_invoice_id", invoiceId);
  const out: Record<string, number> = {};
  for (const l of (data ?? []) as { original_line_id: string | null; quantity: number }[]) {
    if (l.original_line_id) out[l.original_line_id] = (out[l.original_line_id] ?? 0) + Number(l.quantity);
  }
  return out;
}

/** Create and post a return: reverse journal (same accounts as original), reverse COGS, stock moves. */
export async function createAndPostReturn(originalInvoiceId: string, returnDate: string, lines: ReturnLineInput[], notes: string | null) {
  const { data: inv, error } = await supabase.from("invoices").select("*").eq("id", originalInvoiceId).single();
  if (error || !inv) throw error ?? new Error("الفاتورة الأصلية غير موجودة");
  if (inv.status !== "posted") throw new Error("يجب أن تكون الفاتورة الأصلية مرحّلة");
  const valid = lines.filter((l) => l.quantity > 0);
  if (!valid.length) throw new Error("أدخل كمية مرتجعة واحدة على الأقل");

  const isSale = inv.type === "sale";
  const gross = r2(valid.reduce((s, l) => s + l.quantity * l.unit_price, 0));
  const ratio = Number(inv.subtotal) > 0 ? gross / Number(inv.subtotal) : 0;
  const discount = r2(Number(inv.discount_amount) * ratio);
  const tax = r2(Number(inv.tax) * ratio);
  const total = r2(gross - discount + tax);

  const { data: ret, error: e1 } = await supabase
    .from("invoice_returns")
    .insert({
      kind: isSale ? "sales_return" : "purchase_return",
      original_invoice_id: inv.id,
      partner_id: inv.partner_id,
      return_date: returnDate,
      subtotal: gross,
      discount_amount: discount,
      tax,
      total,
      notes,
    })
    .select("id, return_no")
    .single();
  if (e1 || !ret) throw e1 ?? new Error("تعذر إنشاء المرتجع");

  const { error: e2 } = await supabase.from("invoice_return_lines").insert(
    valid.map((l, i) => ({ ...l, return_id: ret.id, total: r2(l.quantity * l.unit_price), line_order: i })),
  );
  if (e2) throw e2;

  const desc = `${isSale ? "مرتجع مبيعات" : "مرتجع مشتريات"} #${ret.return_no} - فاتورة #${inv.invoice_no}`;
  let entryId: string | null = null;
  if (inv.partner_account_id && inv.counter_account_id) {
    const { data: entry, error: e3 } = await supabase
      .from("journal_entries")
      .insert({ entry_date: returnDate, description: desc, reference: `RET-${ret.return_no}`, status: "posted", entry_type: isSale ? "sales" : "purchases", approved_at: new Date().toISOString() })
      .select("id")
      .single();
    if (e3 || !entry) throw e3 ?? new Error("تعذر إنشاء القيد");
    entryId = entry.id;
    // Mirror of the original invoice posting, debits/credits swapped
    const jl = [
      { account_id: inv.partner_account_id, partner_id: inv.partner_id, debit: isSale ? 0 : total, credit: isSale ? total : 0, description: desc },
      { account_id: inv.counter_account_id, partner_id: null, debit: isSale ? gross : 0, credit: isSale ? 0 : gross, description: desc },
    ];
    if (discount > 0 && inv.discount_account_id) jl.push({ account_id: inv.discount_account_id, partner_id: null, debit: isSale ? 0 : discount, credit: isSale ? discount : 0, description: desc + " (خصم)" });
    if (tax > 0 && inv.tax_account_id) jl.push({ account_id: inv.tax_account_id, partner_id: null, debit: isSale ? tax : 0, credit: isSale ? 0 : tax, description: desc + " (ضريبة)" });
    const { error: e4 } = await supabase.from("journal_lines").insert(jl.map((l, i) => ({ ...l, entry_id: entry.id, line_order: i })));
    if (e4) throw e4;
  }

  let cogsId: string | null = null;
  const cost = r2(valid.reduce((s, l) => s + l.quantity * l.cost_per_unit, 0));
  if (isSale && cost > 0 && inv.cogs_account_id && inv.inventory_account_id) {
    const { data: c, error: e5 } = await supabase
      .from("journal_entries")
      .insert({ entry_date: returnDate, description: `عكس تكلفة - ${desc}`, reference: `RET-${ret.return_no}`, status: "posted", entry_type: "sales", approved_at: new Date().toISOString() })
      .select("id")
      .single();
    if (e5 || !c) throw e5 ?? new Error("تعذر إنشاء قيد التكلفة");
    cogsId = c.id;
    await supabase.from("journal_lines").insert([
      { entry_id: c.id, account_id: inv.inventory_account_id, debit: cost, credit: 0, description: desc, line_order: 0 },
      { entry_id: c.id, account_id: inv.cogs_account_id, debit: 0, credit: cost, description: desc, line_order: 1 },
    ]);
  }

  const wh = await mainWarehouseId();
  const sign = isSale ? 1 : -1;
  const moves = valid.filter((l) => l.product_id).map((l) => ({
    product_id: l.product_id!, return_id: ret.id, warehouse_id: wh, move_date: returnDate,
    qty: sign * l.quantity, unit_cost: l.cost_per_unit, notes: isSale ? "مرتجع مبيعات" : "مرتجع مشتريات",
  }));
  if (moves.length) {
    const { error: e6 } = await supabase.from("stock_moves").insert(moves);
    if (e6) throw e6;
    for (const m of moves) await bumpStock(m.product_id, m.qty);
  }

  await supabase.from("invoice_returns").update({ status: "posted", journal_entry_id: entryId, cogs_journal_entry_id: cogsId }).eq("id", ret.id);
  return ret.id;
}

/* ---------------- Stock vouchers ---------------- */

type VoucherLine = { product_id: string; quantity: number; unit_cost: number };

async function insertMoves(voucherId: string, date: string, warehouseId: string, lines: VoucherLine[], sign: 1 | -1, note: string, touchTotal: boolean) {
  const moves = lines.map((l) => ({ product_id: l.product_id, voucher_id: voucherId, warehouse_id: warehouseId, move_date: date, qty: sign * Number(l.quantity), unit_cost: Number(l.unit_cost || 0), notes: note }));
  if (!moves.length) return;
  const { error } = await supabase.from("stock_moves").insert(moves);
  if (error) throw error;
  if (touchTotal) for (const m of moves) await bumpStock(m.product_id, m.qty);
}

/** Advance a voucher: in/out => posted; transfer: draft => sent => received. */
export async function advanceVoucher(voucherId: string) {
  const { data: v, error } = await supabase.from("stock_vouchers").select("*, stock_voucher_lines(*)").eq("id", voucherId).single();
  if (error || !v) throw error ?? new Error("السند غير موجود");
  const lines = (v.stock_voucher_lines ?? []) as VoucherLine[];
  let next: string;
  if (v.kind === "in" && v.status === "draft") {
    await insertMoves(v.id, v.voucher_date, v.warehouse_id, lines, 1, "سند وارد", true); next = "posted";
  } else if (v.kind === "out" && v.status === "draft") {
    await insertMoves(v.id, v.voucher_date, v.warehouse_id, lines, -1, "سند صرف", true); next = "posted";
  } else if (v.kind === "transfer" && v.status === "draft") {
    await insertMoves(v.id, v.voucher_date, v.warehouse_id, lines, -1, "تحويل - إرسال", false); next = "sent";
  } else if (v.kind === "transfer" && v.status === "sent") {
    if (!v.target_warehouse_id) throw new Error("لا توجد جهة مستلمة");
    await insertMoves(v.id, new Date().toISOString().slice(0, 10), v.target_warehouse_id, lines, 1, "تحويل - استلام", false); next = "received";
  } else throw new Error("لا يوجد إجراء متاح لهذه الحالة");
  const { error: e2 } = await supabase.from("stock_vouchers").update({ status: next }).eq("id", v.id);
  if (e2) throw e2;
}
