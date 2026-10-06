import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Check, Send, PackageCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DocSheet, DocToolbar, StatusChip } from "@/components/document-sheet";
import { advanceVoucher } from "@/lib/inventory-docs";

export const Route = createFileRoute("/_app/stock-vouchers")({
  head: () => ({
    meta: [
      { title: "سندات المخزون — وارد وصرف وتحويل" },
      { name: "description", content: "سندات الوارد والصرف والتحويل بين المخازن والفروع بقالب طباعة موحد." },
      { property: "og:title", content: "سندات المخزون" },
      { property: "og:description", content: "وارد وصرف وتحويل مخزني قابل للتتبع." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VouchersPage,
});

type Kind = "in" | "out" | "transfer";
const KIND: Record<Kind, string> = { in: "سند وارد للمخزن", out: "سند صرف من المخزن", transfer: "سند تحويل مخزني" };
const PARTY: Record<string, string> = { supplier: "مورد", warehouse: "مخزن آخر", branch: "فرع آخر", department: "جهة/قسم داخلي", external: "جهة خارجية", other: "أخرى" };
type Mode = { m: "list" } | { m: "new"; kind: "in" | "out" } | { m: "view"; id: string };

function useRefs() {
  return useQuery({
    queryKey: ["warehouses", "refs"],
    queryFn: async () => {
      const [{ data: wh }, { data: products }] = await Promise.all([
        supabase.from("warehouses").select("id, name, kind").eq("is_active", true).order("created_at"),
        supabase.from("products").select("id, name, unit, cost_price").eq("is_deleted", false).order("name"),
      ]);
      return { wh: wh ?? [], products: products ?? [] };
    },
  });
}

function VouchersPage() {
  const [mode, setMode] = useState<Mode>({ m: "list" });
  if (mode.m === "new") return <NewVoucher base={mode.kind} onDone={(id) => setMode(id ? { m: "view", id } : { m: "list" })} />;
  if (mode.m === "view") return <ViewVoucher id={mode.id} onBack={() => setMode({ m: "list" })} />;
  return <List onNew={(k) => setMode({ m: "new", kind: k })} onOpen={(id) => setMode({ m: "view", id })} />;
}

function List({ onNew, onOpen }: { onNew: (k: "in" | "out") => void; onOpen: (id: string) => void }) {
  const [f, setF] = useState<"all" | Kind>("all");
  const { data: refs } = useRefs();
  const { data = [] } = useQuery({
    queryKey: ["stock-vouchers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_vouchers").select("*").order("voucher_date", { ascending: false }).order("voucher_no", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const whName = (id: string | null) => refs?.wh.find((w) => w.id === id)?.name ?? "—";
  const rows = data.filter((r) => f === "all" || r.kind === f);
  return (
    <div className="p-3 md:p-6">
      <DocToolbar title="سندات المخزون" actions={<>
        <button className="doc-btn doc-btn-primary" onClick={() => onNew("in")}><Plus className="h-4 w-4" />سند وارد</button>
        <button className="doc-btn" onClick={() => onNew("out")}><Plus className="h-4 w-4" />سند صرف / تحويل</button>
      </>} />
      <div className="doc-noprint mx-auto mb-2 flex max-w-[1000px] flex-wrap gap-1">
        {(["all", "in", "out", "transfer"] as const).map((k) => (
          <button key={k} className={`doc-btn ${f === k ? "doc-btn-primary" : ""}`} onClick={() => setF(k)}>{k === "all" ? "الكل" : k === "in" ? "وارد" : k === "out" ? "صرف" : "تحويل"}</button>
        ))}
      </div>
      <DocSheet title="سجل سندات المخزون" signatures={[]}>
        <table>
          <thead><tr><th>الرقم</th><th>النوع</th><th>التاريخ</th><th>المخزن</th><th>الجهة</th><th>السبب</th><th>الحالة</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => onOpen(r.id)}>
                <td className="num">{r.voucher_no}</td><td>{KIND[r.kind as Kind]}</td><td className="num">{r.voucher_date}</td><td>{whName(r.warehouse_id)}</td>
                <td>{r.target_warehouse_id ? whName(r.target_warehouse_id) : r.party_name ?? (r.party_type ? PARTY[r.party_type] : "—")}</td>
                <td>{r.reason ?? ""}</td><td><StatusChip status={r.status} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", padding: 16 }}>لا توجد سندات</td></tr>}
          </tbody>
        </table>
      </DocSheet>
    </div>
  );
}

type Line = { product_id: string; quantity: number; unit: string; unit_cost: number };

function NewVoucher({ base, onDone }: { base: "in" | "out"; onDone: (id?: string) => void }) {
  const qc = useQueryClient();
  const { data: refs } = useRefs();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [warehouse, setWarehouse] = useState("");
  const [partyType, setPartyType] = useState(base === "in" ? "supplier" : "department");
  const [partyName, setPartyName] = useState("");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ product_id: "", quantity: 0, unit: "", unit_cost: 0 }]);
  const [busy, setBusy] = useState(false);
  const wh = refs?.wh ?? [];
  const whId = warehouse || wh[0]?.id || "";
  const isTransfer = base === "out" && (partyType === "warehouse" || partyType === "branch");
  const kind: Kind = isTransfer ? "transfer" : base;
  const targets = wh.filter((w) => w.id !== whId && w.kind === partyType);

  const setLine = (i: number, p: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));

  async function save(post: boolean) {
    const valid = lines.filter((l) => l.product_id && l.quantity > 0);
    if (!whId || !valid.length) return toast.error("اختر المخزن وأدخل صنفًا واحدًا على الأقل");
    if (isTransfer && !target) return toast.error("اختر الجهة المستلمة");
    setBusy(true);
    try {
      const { data: v, error } = await supabase.from("stock_vouchers").insert({
        kind, voucher_date: date, warehouse_id: whId, target_warehouse_id: isTransfer ? target : null,
        party_type: partyType, party_name: isTransfer ? null : partyName || null, reason: reason || null, notes: notes || null,
      }).select("id").single();
      if (error || !v) throw error;
      const { error: e2 } = await supabase.from("stock_voucher_lines").insert(valid.map((l, i) => ({ ...l, unit: l.unit || null, voucher_id: v.id, line_order: i })));
      if (e2) throw e2;
      if (post) await advanceVoucher(v.id);
      qc.invalidateQueries({ queryKey: ["stock-vouchers"] });
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(post ? (isTransfer ? "تم إرسال التحويل" : "تم ترحيل السند") : "تم الحفظ كمسودة");
      onDone(v.id);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="p-3 md:p-6">
      <DocToolbar title={`جديد: ${KIND[kind]}`} onBack={() => onDone()} actions={<>
        <button className="doc-btn" disabled={busy} onClick={() => save(false)}>حفظ مسودة</button>
        <button className="doc-btn doc-btn-primary" disabled={busy} onClick={() => save(true)}><Check className="h-4 w-4" />{isTransfer ? "حفظ وإرسال" : "حفظ وترحيل"}</button>
      </>} />
      <div className="doc-noprint mx-auto mb-3 grid max-w-[1000px] grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="text-xs">التاريخ<input type="date" className="inp mt-1" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="text-xs">{base === "in" ? "المخزن" : "المخزن المصدر"}
          <select className="inp mt-1" value={whId} onChange={(e) => setWarehouse(e.target.value)}>{wh.filter((w) => w.kind === "warehouse").map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        <label className="text-xs">{base === "in" ? "الجهة الموردة / المصدر" : "الجهة الصادر إليها"}
          <select className="inp mt-1" value={partyType} onChange={(e) => { setPartyType(e.target.value); setTarget(""); }}>
            {(base === "in" ? ["supplier", "external", "other"] : ["warehouse", "branch", "department", "external"]).map((k) => <option key={k} value={k}>{PARTY[k]}</option>)}
          </select></label>
        {isTransfer ? (
          <label className="text-xs">الجهة المستلمة
            <select className="inp mt-1" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">— اختر —</option>{targets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        ) : (
          <label className="text-xs">اسم الجهة<input className="inp mt-1" value={partyName} onChange={(e) => setPartyName(e.target.value)} /></label>
        )}
        <label className="text-xs">{base === "in" ? "سبب الإضافة" : "سبب الصرف"}<input className="inp mt-1" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <label className="text-xs">ملاحظات<input className="inp mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      </div>
      <DocSheet title={KIND[kind]} number="جديد" meta={[{ label: "التاريخ", value: date }, { label: "المخزن", value: wh.find((w) => w.id === whId)?.name ?? "—" }]}>
        <table>
          <thead><tr><th>الصنف</th><th>الوحدة</th><th>الكمية</th>{base === "in" && <th>التكلفة</th>}<th className="doc-noprint"></th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td><select className="w-full border border-border bg-background px-1" value={l.product_id} onChange={(e) => {
                  const p = refs?.products.find((x) => x.id === e.target.value);
                  setLine(i, { product_id: e.target.value, unit: p?.unit ?? "", unit_cost: Number(p?.cost_price ?? 0) });
                }}><option value="">— اختر صنف —</option>{refs?.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
                <td><input className="w-20 border border-border bg-background px-1" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} /></td>
                <td><input type="number" step="any" min={0} className="num w-24 border border-border bg-background px-1" value={l.quantity || ""} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} /></td>
                {base === "in" && <td><input type="number" step="any" min={0} className="num w-24 border border-border bg-background px-1" value={l.unit_cost || ""} onChange={(e) => setLine(i, { unit_cost: Number(e.target.value) })} /></td>}
                <td className="doc-noprint"><button onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="حذف السطر"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="doc-btn doc-noprint mt-2" onClick={() => setLines([...lines, { product_id: "", quantity: 0, unit: "", unit_cost: 0 }])}><Plus className="h-4 w-4" />إضافة سطر</button>
      </DocSheet>
    </div>
  );
}

function ViewVoucher({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { data: refs } = useRefs();
  const [busy, setBusy] = useState(false);
  const { data: v } = useQuery({
    queryKey: ["stock-vouchers", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_vouchers").select("*, stock_voucher_lines(*)").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
  if (!v) return <div className="p-6">...</div>;
  const whName = (x: string | null) => refs?.wh.find((w) => w.id === x)?.name ?? "—";
  const pName = (x: string) => refs?.products.find((p) => p.id === x)?.name ?? "—";
  const lines = [...(v.stock_voucher_lines ?? [])].sort((a, b) => a.line_order - b.line_order);
  const action = v.status === "draft" ? (v.kind === "transfer" ? ["إرسال", Send] : ["ترحيل", Check]) : v.kind === "transfer" && v.status === "sent" ? ["تأكيد الاستلام", PackageCheck] : null;

  async function advance() {
    setBusy(true);
    try {
      await advanceVoucher(id);
      qc.invalidateQueries({ queryKey: ["stock-vouchers"] });
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("تم");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  const Icon = action?.[1] as typeof Check | undefined;
  const party = v.target_warehouse_id ? whName(v.target_warehouse_id) : [v.party_type ? PARTY[v.party_type] : null, v.party_name].filter(Boolean).join(" - ") || "—";
  return (
    <div className="p-3 md:p-6">
      <DocToolbar title={`${KIND[v.kind as Kind]} #${v.voucher_no}`} onBack={onBack}
        actions={action && Icon ? <button className="doc-btn doc-btn-primary" disabled={busy} onClick={advance}><Icon className="h-4 w-4" />{action[0] as string}</button> : null} />
      <DocSheet title={KIND[v.kind as Kind]} number={v.voucher_no}
        meta={[
          { label: "التاريخ", value: v.voucher_date },
          { label: v.kind === "in" ? "المخزن" : "المخزن المصدر", value: whName(v.warehouse_id) },
          { label: v.kind === "in" ? "الجهة الموردة" : v.kind === "transfer" ? "الجهة المستلمة" : "الجهة الصادر إليها", value: party },
          { label: "الحالة", value: <StatusChip status={v.status} /> },
          ...(v.reason ? [{ label: "السبب", value: v.reason }] : []),
        ]}
        signatures={v.kind === "transfer" ? ["المُرسِل", "أمين المخزن", "المُستلِم"] : ["أعدّه", "أمين المخزن", "اعتمده"]}>
        <table>
          <thead><tr><th>#</th><th>الصنف</th><th>الوحدة</th><th>الكمية</th>{v.kind === "in" && <th>التكلفة</th>}</tr></thead>
          <tbody>{lines.map((l, i) => (
            <tr key={l.id}><td className="num">{i + 1}</td><td>{pName(l.product_id)}</td><td>{l.unit ?? ""}</td><td className="num">{l.quantity}</td>{v.kind === "in" && <td className="num">{Number(l.unit_cost).toFixed(2)}</td>}</tr>
          ))}</tbody>
        </table>
        {v.notes && <div style={{ fontSize: 11, marginTop: 6 }}>ملاحظات: {v.notes}</div>}
      </DocSheet>
    </div>
  );
}
