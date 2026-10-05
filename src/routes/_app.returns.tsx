import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DocSheet, DocToolbar, StatusChip } from "@/components/document-sheet";
import { createAndPostReturn, returnedQtyByLine } from "@/lib/inventory-docs";

export const Route = createFileRoute("/_app/returns")({
  head: () => ({
    meta: [
      { title: "فواتير المرتجعات — مرتجع المبيعات والمشتريات" },
      { name: "description", content: "إنشاء وطباعة فواتير مرتجع المبيعات والمشتريات مع القيد وتحديث المخزون تلقائيًا." },
      { property: "og:title", content: "فواتير المرتجعات" },
      { property: "og:description", content: "مرتجع مبيعات ومشتريات مرتبط بالفاتورة الأصلية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReturnsPage,
});

type Mode = { m: "list" } | { m: "new"; kind: "sales_return" | "purchase_return" } | { m: "view"; id: string };
const n2 = (n: number) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kindLabel = (k: string) => (k === "sales_return" ? "فاتورة مرتجع مبيعات" : "فاتورة مرتجع مشتريات");

function ReturnsPage() {
  const [mode, setMode] = useState<Mode>({ m: "list" });
  if (mode.m === "new") return <NewReturn kind={mode.kind} onDone={(id) => setMode(id ? { m: "view", id } : { m: "list" })} />;
  if (mode.m === "view") return <ViewReturn id={mode.id} onBack={() => setMode({ m: "list" })} />;
  return <ReturnsList onNew={(kind) => setMode({ m: "new", kind })} onOpen={(id) => setMode({ m: "view", id })} />;
}

function ReturnsList({ onNew, onOpen }: { onNew: (k: "sales_return" | "purchase_return") => void; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<"all" | "sales_return" | "purchase_return">("all");
  const { data = [] } = useQuery({
    queryKey: ["returns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoice_returns").select("*, invoices!invoice_returns_original_invoice_id_fkey(invoice_no)").order("return_date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
  const { data: partners = {} } = usePartnerNames();
  const rows = data.filter((r) => filter === "all" || r.kind === filter);
  return (
    <div className="p-3 md:p-6">
      <DocToolbar
        title="فواتير المرتجعات"
        actions={<>
          <button className="doc-btn doc-btn-primary" onClick={() => onNew("sales_return")}><Plus className="h-4 w-4" />مرتجع مبيعات</button>
          <button className="doc-btn" onClick={() => onNew("purchase_return")}><Plus className="h-4 w-4" />مرتجع مشتريات</button>
        </>}
      />
      <div className="doc-noprint mx-auto mb-2 flex max-w-[1000px] gap-1">
        {(["all", "sales_return", "purchase_return"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`doc-btn ${filter === f ? "doc-btn-primary" : ""}`}>
            {f === "all" ? "الكل" : f === "sales_return" ? "مرتجع مبيعات" : "مرتجع مشتريات"}
          </button>
        ))}
      </div>
      <DocSheet title="سجل المرتجعات" signatures={[]}>
        <table>
          <thead><tr><th>الرقم</th><th>النوع</th><th>التاريخ</th><th>الطرف</th><th>الفاتورة الأصلية</th><th>الإجمالي</th><th>الحالة</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => onOpen(r.id)} style={{ cursor: "pointer" }}>
                <td className="num">{r.return_no}</td><td>{r.kind === "sales_return" ? "مرتجع مبيعات" : "مرتجع مشتريات"}</td>
                <td className="num">{r.return_date}</td><td>{partners[r.partner_id] ?? "—"}</td>
                <td className="num">#{r.invoices?.invoice_no}</td><td className="num">{n2(r.total)}</td><td><StatusChip status={r.status} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", padding: 16 }}>لا توجد مرتجعات</td></tr>}
          </tbody>
        </table>
      </DocSheet>
    </div>
  );
}

function usePartnerNames() {
  return useQuery({
    queryKey: ["partners", "names"],
    queryFn: async () => {
      const { data } = await supabase.from("partners").select("id, name");
      return Object.fromEntries((data ?? []).map((p: any) => [p.id, p.name])) as Record<string, string>;
    },
  });
}

function NewReturn({ kind, onDone }: { kind: "sales_return" | "purchase_return"; onDone: (id?: string) => void }) {
  const qc = useQueryClient();
  const invType = kind === "sales_return" ? "sale" : "purchase";
  const [partnerId, setPartnerId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const { data: partners = [] } = useQuery({
    queryKey: ["returns", "partners", invType],
    queryFn: async () => {
      const { data } = await supabase.from("invoices").select("partner_id, partners(name)").eq("type", invType).eq("status", "posted").eq("is_deleted", false);
      const m = new Map<string, string>();
      (data ?? []).forEach((r: any) => m.set(r.partner_id, r.partners?.name ?? "—"));
      return [...m.entries()].map(([id, name]) => ({ id, name }));
    },
  });
  const { data: invoices = [] } = useQuery({
    queryKey: ["returns", "invoices", invType, partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data } = await supabase.from("invoices").select("id, invoice_no, invoice_date, total").eq("type", invType).eq("status", "posted").eq("partner_id", partnerId).eq("is_deleted", false).order("invoice_date", { ascending: false });
      return data ?? [];
    },
  });
  const { data: detail } = useQuery({
    queryKey: ["returns", "invoice-lines", invoiceId],
    enabled: !!invoiceId,
    queryFn: async () => {
      const [{ data: inv }, { data: lines }, returned] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", invoiceId).single(),
        supabase.from("invoice_lines").select("*, products(name, unit)").eq("invoice_id", invoiceId).order("line_order"),
        returnedQtyByLine(invoiceId),
      ]);
      return { inv, lines: (lines ?? []) as any[], returned };
    },
  });

  const calc = useMemo(() => {
    if (!detail?.inv) return { gross: 0, disc: 0, tax: 0, total: 0 };
    const gross = detail.lines.reduce((s, l) => s + (qty[l.id] ?? 0) * Number(l.unit_price), 0);
    const ratio = Number(detail.inv.subtotal) > 0 ? gross / Number(detail.inv.subtotal) : 0;
    const disc = Number(detail.inv.discount_amount) * ratio, tax = Number(detail.inv.tax) * ratio;
    return { gross, disc, tax, total: gross - disc + tax };
  }, [detail, qty]);

  async function save() {
    if (!detail) return;
    setBusy(true);
    try {
      const id = await createAndPostReturn(invoiceId, date, detail.lines.map((l) => ({
        original_line_id: l.id, product_id: l.product_id, description: l.description ?? l.products?.name ?? null,
        quantity: qty[l.id] ?? 0, unit_price: Number(l.unit_price), cost_per_unit: Number(l.cost_per_unit || 0),
      })), notes || null);
      qc.invalidateQueries({ queryKey: ["returns"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("تم ترحيل المرتجع وإنشاء القيد وتحديث المخزون");
      onDone(id);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  const partnerLabel = kind === "sales_return" ? "العميل" : "المورد";
  return (
    <div className="p-3 md:p-6">
      <DocToolbar title={`جديد: ${kindLabel(kind)}`} onBack={() => onDone()}
        actions={<button className="doc-btn doc-btn-primary" disabled={busy || calc.gross <= 0} onClick={save}><Check className="h-4 w-4" />حفظ وترحيل</button>} />
      <div className="doc-noprint mx-auto mb-3 grid max-w-[1000px] grid-cols-1 gap-2 sm:grid-cols-4">
        <label className="text-xs">{partnerLabel}
          <select className="inp mt-1" value={partnerId} onChange={(e) => { setPartnerId(e.target.value); setInvoiceId(""); setQty({}); }}>
            <option value="">— اختر —</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></label>
        <label className="text-xs">الفاتورة الأصلية
          <select className="inp mt-1" value={invoiceId} disabled={!partnerId} onChange={(e) => { setInvoiceId(e.target.value); setQty({}); }}>
            <option value="">— اختر —</option>{invoices.map((i: any) => <option key={i.id} value={i.id}>#{i.invoice_no} · {i.invoice_date} · {n2(i.total)}</option>)}
          </select></label>
        <label className="text-xs">تاريخ المرتجع<input type="date" className="inp mt-1" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="text-xs">ملاحظات<input className="inp mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      </div>
      <DocSheet title={kindLabel(kind)} number="جديد"
        meta={[{ label: partnerLabel, value: partners.find((p) => p.id === partnerId)?.name ?? "—" }, { label: "الفاتورة الأصلية", value: detail?.inv ? `#${detail.inv.invoice_no}` : "—" }, { label: "التاريخ", value: date }]}
        totals={[{ label: "الإجمالي قبل الخصم", value: n2(calc.gross) }, { label: "الخصم", value: n2(calc.disc) }, { label: "الضريبة", value: n2(calc.tax) }, { label: "إجمالي المرتجع", value: n2(calc.total), strong: true }]}>
        <table>
          <thead><tr><th>الصنف</th><th>الكمية الأصلية</th><th>مرتجع سابق</th><th>الكمية المرتجعة</th><th>السعر</th><th>الإجمالي</th></tr></thead>
          <tbody>
            {(detail?.lines ?? []).map((l) => {
              const max = Number(l.quantity) - (detail!.returned[l.id] ?? 0);
              return (
                <tr key={l.id}>
                  <td>{l.products?.name ?? l.description}</td><td className="num">{l.quantity}</td><td className="num">{detail!.returned[l.id] ?? 0}</td>
                  <td><input type="number" min={0} max={max} step="any" className="num w-24 border border-border bg-background px-1" value={qty[l.id] ?? ""}
                    onChange={(e) => setQty({ ...qty, [l.id]: Math.max(0, Math.min(max, Number(e.target.value))) })} /></td>
                  <td className="num">{n2(l.unit_price)}</td><td className="num">{n2((qty[l.id] ?? 0) * Number(l.unit_price))}</td>
                </tr>
              );
            })}
            {!detail && <tr><td colSpan={6} style={{ textAlign: "center", padding: 16 }}>اختر {partnerLabel} ثم الفاتورة الأصلية</td></tr>}
          </tbody>
        </table>
      </DocSheet>
    </div>
  );
}

function ViewReturn({ id, onBack }: { id: string; onBack: () => void }) {
  const { data } = useQuery({
    queryKey: ["returns", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoice_returns").select("*, invoice_return_lines(*, products(name, unit)), invoices!invoice_returns_original_invoice_id_fkey(invoice_no), partners:partner_id(name)").eq("id", id).single();
      if (error) {
        const r = await supabase.from("invoice_returns").select("*, invoice_return_lines(*, products(name, unit)), invoices!invoice_returns_original_invoice_id_fkey(invoice_no)").eq("id", id).single();
        return r.data as any;
      }
      return data as any;
    },
  });
  const { data: partners = {} } = usePartnerNames();
  if (!data) return <div className="p-6">...</div>;
  const lines = [...(data.invoice_return_lines ?? [])].sort((a: any, b: any) => a.line_order - b.line_order);
  return (
    <div className="p-3 md:p-6">
      <DocToolbar title={`${kindLabel(data.kind)} #${data.return_no}`} onBack={onBack} />
      <DocSheet title={kindLabel(data.kind)} number={data.return_no}
        meta={[{ label: data.kind === "sales_return" ? "العميل" : "المورد", value: partners[data.partner_id] ?? "—" }, { label: "الفاتورة الأصلية", value: `#${data.invoices?.invoice_no}` }, { label: "التاريخ", value: data.return_date }, { label: "الحالة", value: data.status === "posted" ? "مرحّل" : "مسودة" }]}
        totals={[{ label: "الإجمالي قبل الخصم", value: n2(data.subtotal) }, { label: "الخصم", value: n2(data.discount_amount) }, { label: "الضريبة", value: n2(data.tax) }, { label: "إجمالي المرتجع", value: n2(data.total), strong: true }]}>
        <table>
          <thead><tr><th>#</th><th>الصنف</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
          <tbody>{lines.map((l: any, i: number) => (
            <tr key={l.id}><td className="num">{i + 1}</td><td>{l.products?.name ?? l.description}</td><td>{l.products?.unit ?? ""}</td><td className="num">{l.quantity}</td><td className="num">{n2(l.unit_price)}</td><td className="num">{n2(l.total)}</td></tr>
          ))}</tbody>
        </table>
        {data.notes && <div style={{ fontSize: 11, marginTop: 6 }}>ملاحظات: {data.notes}</div>}
      </DocSheet>
    </div>
  );
}
