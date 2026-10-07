import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DocSheet, DocToolbar } from "@/components/document-sheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { exportToExcel } from "@/lib/export-utils";

export const Route = createFileRoute("/_app/warehouses")({
  head: () => ({ meta: [
    { title: "حركة المخزون والمخازن والفروع — مالية" },
    { name: "description", content: "الوارد والصادر والمرتجعات وأرصدة الأصناف حسب الفترة والمخزن أو الفرع." },
    { property: "og:title", content: "حركة المخزون والمخازن والفروع — مالية" },
    { property: "og:description", content: "تقارير حركة المخزون وأرصدة الأصناف وإدارة المخازن والفروع." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: WarehousesPage,
});

function WarehousesPage() {
  const qc = useQueryClient();
  const { permissions } = useAuth();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [kind, setKind] = useState<"warehouse" | "branch">("warehouse");
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"balances" | "movements">("movements");
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [warehouse, setWarehouse] = useState("main");
  const [product, setProduct] = useState("");
  const [movement, setMovement] = useState("all");
  const { data, isPending, error } = useQuery({
    queryKey: ["warehouses", "stock-report"],
    queryFn: async () => {
      const results = await Promise.all([
        supabase.from("warehouses").select("*").order("created_at"),
        supabase.from("products").select("id, name, unit, sku").eq("is_deleted", false).order("name"),
        supabase.from("stock_moves").select("*, invoices(invoice_no, type), invoice_returns(return_no, kind), stock_vouchers(voucher_no, kind)").order("move_date").order("created_at").order("id"),
      ]);
      for (const result of results) if (result.error) throw result.error;
      return { wh: results[0].data ?? [], products: results[1].data ?? [], moves: results[2].data ?? [] };
    },
  });
  const wh = data?.wh ?? [];
  const warehouseId = warehouse === "main" ? wh[0]?.id : warehouse;
  const products = new Map((data?.products ?? []).map(p => [p.id, p]));
  const warehouses = new Map(wh.map(w => [w.id, w]));
  const matching = (data?.moves ?? []).filter(m => (!warehouseId || (m.warehouse_id ?? wh[0]?.id) === warehouseId) && (!product || m.product_id === product));
  const inPeriod = (date: string) => (!from || date >= from) && (!to || date <= to);
  const balance: Record<string, number> = {};
  const rows = matching.map(m => {
    const qty = Number(m.qty);
    balance[m.product_id] = (balance[m.product_id] ?? 0) + qty;
    const isReturn = Boolean(m.return_id);
    const label = isReturn ? (qty >= 0 ? "مرتجع مبيعات" : "مرتجع مشتريات") : m.stock_vouchers?.kind === "transfer" ? (qty >= 0 ? "تحويل وارد" : "تحويل صادر") : qty >= 0 ? "وارد" : "صادر";
    const ref = m.invoice_returns ? `مرتجع #${m.invoice_returns.return_no}` : m.stock_vouchers ? `سند #${m.stock_vouchers.voucher_no}` : m.invoices ? `فاتورة #${m.invoices.invoice_no}` : "—";
    return { ...m, qty, label, ref, balance: balance[m.product_id], isReturn };
  }).filter(m => inPeriod(m.move_date) && (movement === "all" || movement === "return" && m.isReturn || movement === "in" && m.qty > 0 && !m.isReturn || movement === "out" && m.qty < 0 && !m.isReturn));
  const summaries = (data?.products ?? []).filter(p => !product || p.id === product).map(p => {
    const moves = matching.filter(m => m.product_id === p.id);
    const period = moves.filter(m => inPeriod(m.move_date));
    const sum = (list: typeof moves) => list.reduce((s, m) => s + Number(m.qty), 0);
    return { p, opening: sum(moves.filter(m => from && m.move_date < from)), incoming: sum(period.filter(m => !m.return_id && Number(m.qty) > 0)), outgoing: -sum(period.filter(m => !m.return_id && Number(m.qty) < 0)), salesReturn: sum(period.filter(m => m.return_id && Number(m.qty) > 0)), purchaseReturn: -sum(period.filter(m => m.return_id && Number(m.qty) < 0)), closing: sum(moves.filter(m => !to || m.move_date <= to)), current: sum(moves) };
  });
  const headers = view === "movements" ? ["التاريخ", "الصنف", "المخزن / الفرع", "الحركة", "المستند", "وارد", "صادر", "الرصيد", "التكلفة", "ملاحظات"] : ["الصنف", "الوحدة", "افتتاحي", "وارد", "صادر", "مرتجع مبيعات", "مرتجع مشتريات", "آخر الفترة", "الرصيد الحالي"];
  const exported = view === "movements" ? rows.map(m => [m.move_date, products.get(m.product_id)?.name ?? "—", warehouses.get(m.warehouse_id ?? wh[0]?.id ?? "")?.name ?? "—", m.label, m.ref, Math.max(0, m.qty), Math.max(0, -m.qty), m.balance, Number(m.unit_cost), m.notes ?? ""]) : summaries.map(s => [s.p.name, s.p.unit ?? "", s.opening, s.incoming, s.outgoing, s.salesReturn, s.purchaseReturn, s.closing, s.current]);
  async function add() {
    if (!name.trim() || saving) return;
    setSaving(true);
    const { error } = await supabase.from("warehouses").insert({ name: name.trim(), kind, location: location.trim() || null });
    setSaving(false);
    if (error) return toast.error(error.message);
    setName(""); setLocation("");
    await qc.invalidateQueries({ queryKey: ["warehouses"] });
    toast.success("تمت إضافة المخزن / الفرع");
  }
  return <div className="p-3 md:p-5">
    <DocToolbar title="المخازن والفروع · حركة المخزون" actions={<Button variant="outline" className="doc-btn" onClick={() => exportToExcel("stock-report", "حركة المخزون", [{ headers, rows: exported }], { subtitle: `${from} — ${to}` })}><Download />Excel</Button>} />
    {permissions.has("products.manage") && <div className="doc-noprint mx-auto max-w-[1000px] mb-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
      <input className="inp" aria-label="اسم المخزن أو الفرع" placeholder="اسم المخزن أو الفرع" value={name} onChange={e => setName(e.target.value)} />
      <input className="inp" aria-label="الموقع" placeholder="الموقع" value={location} onChange={e => setLocation(e.target.value)} />
      <select className="inp" aria-label="نوع الموقع" value={kind} onChange={e => setKind(e.target.value as "warehouse" | "branch")}><option value="warehouse">مخزن</option><option value="branch">فرع</option></select>
      <Button className="doc-btn doc-btn-primary" disabled={saving || !name.trim()} onClick={add}><Plus />إضافة</Button>
    </div>}
    <div className="doc-noprint mx-auto max-w-[1000px] mb-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <label className="text-xs">من تاريخ<input aria-label="من تاريخ" type="date" className="inp" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label className="text-xs">إلى تاريخ<input aria-label="إلى تاريخ" type="date" className="inp" min={from} value={to} onChange={e => setTo(e.target.value)} /></label>
      <label className="text-xs">المخزن / الفرع<select aria-label="المخزن / الفرع" className="inp" value={warehouse} onChange={e => setWarehouse(e.target.value)}><option value="main">المخزن الرئيسي</option><option value="">كل المخازن والفروع</option>{wh.map(w => <option key={w.id} value={w.id}>{w.name}{w.kind === "branch" ? " (فرع)" : ""}</option>)}</select></label>
      <label className="text-xs">الصنف<select aria-label="الصنف" className="inp" value={product} onChange={e => setProduct(e.target.value)}><option value="">كل الأصناف</option>{(data?.products ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="text-xs">الحركة<select aria-label="الحركة" className="inp" value={movement} disabled={view === "balances"} onChange={e => setMovement(e.target.value)}><option value="all">كل الحركات</option><option value="in">الوارد</option><option value="out">الصادر</option><option value="return">المرتجعات</option></select></label>
      <label className="text-xs">التقرير<select aria-label="التقرير" className="inp" value={view} onChange={e => setView(e.target.value as typeof view)}><option value="movements">تفاصيل الحركة</option><option value="balances">أرصدة المخزون</option></select></label>
    </div>
    <DocSheet title={view === "movements" ? "تفاصيل حركة المخزون" : "أرصدة المخزون"} signatures={[]} meta={[{label: "الفترة", value: `${from || "البداية"} — ${to || "اليوم"}`}, {label: "المخزن / الفرع", value: warehouses.get(warehouseId ?? "")?.name ?? "كل المخازن والفروع"}, {label: "الصنف", value: products.get(product)?.name ?? "كل الأصناف"}]}>
      {isPending ? <p role="status">جاري تحميل المخزون…</p> : error ? <p role="alert" className="text-destructive">تعذّر تحميل التقرير: {error.message}</p> : from && to && from > to ? <p role="alert">تاريخ البداية يجب أن يسبق تاريخ النهاية.</p> : <div className="overflow-x-auto"><table><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{exported.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={typeof v === "number" ? "num" : undefined}>{typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 3 }) : v}</td>)}</tr>)}{!exported.length && <tr><td colSpan={headers.length} className="text-center">لا توجد حركات خلال الفترة المحددة</td></tr>}</tbody></table></div>}
    </DocSheet>
  </div>;
}
