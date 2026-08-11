import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, X, FileText, Receipt, Users, CheckCircle2, Clock, Search, Printer, Download, Package, ChevronDown, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/confirm-dialog";
import { archiveRecord, softDeleteRecord } from "@/lib/records";
import { createReversalEntry } from "@/lib/posting";
import { useI18n } from "@/lib/i18n";
import { postInvoiceToJournal, postPaymentToJournal, unpostJournal, applyStockForInvoice, reverseStockForInvoice } from "@/lib/posting";
import { exportToExcel, exportToPDF, exportReceiptPDF } from "@/lib/export-utils";
import { fetchCompanyBrand } from "@/lib/company";


type Product = { id: string; sku: string | null; name: string; unit: string | null; sale_price: number; cost_price: number; stock_qty: number; tracks_inventory: boolean; is_active: boolean };
type Line = { id?: string; product_id: string | null; description: string; quantity: number; unit_price: number; total: number; cost_per_unit: number; line_order: number };

type Kind = "customer" | "supplier";

type Partner = {
  id: string; code: string | null; name: string; type: "customer" | "supplier" | "both";
  phone: string | null; email: string | null; is_active: boolean;
};
type Account = { id: string; code: string; name: string; type: string; parent_id: string | null };
type Invoice = {
  id: string; type: "sale" | "purchase"; invoice_no: number; partner_id: string;
  invoice_date: string; due_date: string | null; reference: string | null; notes: string | null;
  subtotal: number; tax: number; total: number; status: "draft" | "posted" | "cancelled";
  partner_account_id: string | null; counter_account_id: string | null; tax_account_id: string | null;
  journal_entry_id: string | null;
  discount_type: "amount" | "percent"; discount_value: number; discount_amount: number;
  discount_account_id: string | null; cogs_account_id: string | null; inventory_account_id: string | null;
};
type Payment = {
  id: string; kind: "receipt" | "payment"; payment_no: number; partner_id: string;
  invoice_id: string | null; payment_date: string; amount: number; method: string | null;
  reference: string | null; notes: string | null;
  cash_account_id: string; partner_account_id: string; status: string; journal_entry_id: string | null;
};

export function PartnerWorkspace({ kind }: { kind: Kind }) {
  const { t, fmt } = useI18n();
  const [tab, setTab] = useState<"list" | "invoices" | "payments">("invoices");
  const isCust = kind === "customer";

  const title = isCust ? "العملاء" : "الموردون";
  const titleEn = isCust ? "Customers" : "Suppliers";

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{titleEn} · {isCust ? "إدارة العملاء وفواتيرهم ودفعاتهم" : "إدارة الموردين وفواتيرهم ودفعاتهم"}</p>
      </header>

      <div className="flex gap-1 mb-6 border-b">
        {([
          ["invoices", isCust ? "فواتير العملاء" : "فواتير الموردين", FileText],
          ["payments", isCust ? "الدفعات الواردة" : "الدفعات الصادرة", Receipt],
          ["list", isCust ? "قائمة العملاء" : "قائمة الموردين", Users],
        ] as const).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "list" && <PartnersList kind={kind} />}
      {tab === "invoices" && <InvoicesTab kind={kind} fmt={fmt} />}
      {tab === "payments" && <PaymentsTab kind={kind} fmt={fmt} />}
    </div>
  );
}

/* ============ Partners list ============ */
function PartnersList({ kind }: { kind: Kind }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partner | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: partners = [] } = useQuery({
    queryKey: ["partners", kind, "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partners")
        .select("*")
        .in("type", kind === "customer" ? ["customer", "both"] : ["supplier", "both"])
        .order("name");
      if (error) throw error;
      return data as Partner[];
    },
  });

  const confirm = useConfirm();
  const del = useMutation({
    mutationFn: async (id: string) => {
      const choice = await confirm({ title: "حذف السجل", description: "لا يمكن التراجع عن هذه العملية." });
      if (!choice) return null;
      if (choice === "archive") await archiveRecord("partners", id);
      else await softDeleteRecord("partners", id);
      return choice;
    },
    onSuccess: (r) => { if (!r) return; qc.invalidateQueries({ queryKey: ["partners"] }); toast.success(r === "archive" ? "تمت الأرشفة" : "تم الحذف"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted-foreground">{partners.length} طرف</p>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium">
          <Plus className="w-4 h-4" /> {kind === "customer" ? "عميل جديد" : "مورد جديد"}
        </button>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr><th className="text-start px-4 py-3">الكود</th><th className="text-start px-4 py-3">الاسم</th><th className="text-start px-4 py-3">الهاتف</th><th className="text-start px-4 py-3">البريد</th><th className="w-20"></th></tr>
          </thead>
          <tbody>
            {partners.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">لا توجد بيانات</td></tr>}
            {partners.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-2.5 num">{p.code || "—"}</td>
                <td className="px-4 py-2.5 font-medium">{p.name}</td>
                <td className="px-4 py-2.5 num text-muted-foreground" dir="ltr">{p.phone || "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground" dir="ltr">{p.email || "—"}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => { setEditing(p); setShowForm(true); }} className="p-1.5 rounded hover:bg-muted"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => del.mutate(p.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <PartnerForm
          kind={kind}
          partner={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["partners"] }); setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function PartnerForm({ partner, kind, onClose, onSaved }: { partner: Partner | null; kind: Kind; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    code: partner?.code ?? "", name: partner?.name ?? "",
    type: (partner?.type ?? kind) as Partner["type"],
    phone: partner?.phone ?? "", email: partner?.email ?? "", is_active: partner?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { ...form, code: form.code || null, phone: form.phone || null, email: form.email || null };
      const { error } = partner ? await supabase.from("partners").update(payload).eq("id", partner.id) : await supabase.from("partners").insert(payload);
      if (error) throw error;
      toast.success(partner ? "تم التحديث" : "تم الإنشاء"); onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-lg">{partner ? "تعديل" : kind === "customer" ? "عميل جديد" : "مورد جديد"}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium block mb-1">الكود</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full px-3 py-2 border rounded-md bg-background" /></div>
            <div><label className="text-xs font-medium block mb-1">النوع</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Partner["type"] })} className="w-full px-3 py-2 border rounded-md bg-background">
                <option value="customer">عميل</option><option value="supplier">مورد</option><option value="both">عميل ومورد</option>
              </select>
            </div>
          </div>
          <div><label className="text-xs font-medium block mb-1">الاسم</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full px-3 py-2 border rounded-md bg-background" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium block mb-1">الهاتف</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border rounded-md bg-background" dir="ltr" /></div>
            <div><label className="text-xs font-medium block mb-1">البريد</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border rounded-md bg-background" dir="ltr" /></div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="flex-1 bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium">{saving ? "..." : "حفظ"}</button>
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-md text-sm">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============ Hooks ============ */
function usePartners(kind: Kind) {
  return useQuery({
    queryKey: ["partners", kind, "for-tx"],
    queryFn: async () => {
      const { data } = await supabase.from("partners").select("id, code, name, type, phone, email, is_active").eq("is_deleted", false).eq("is_archived", false)
        .in("type", kind === "customer" ? ["customer", "both"] : ["supplier", "both"])
        .order("name");
      return (data ?? []) as Partner[];
    },
  });
}

function useAccounts() {
  return useQuery({
    queryKey: ["accounts", "postable"],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("id, code, name, type, parent_id").eq("is_active", true).order("code");
      const all = (data ?? []) as Account[];
      const parents = new Set(all.map((a) => a.parent_id).filter(Boolean));
      return all.filter((a) => !parents.has(a.id));
    },
  });
}

function pickDefault(accounts: Account[], codes: string[], type?: string) {
  for (const c of codes) {
    const f = accounts.find((a) => a.code === c);
    if (f) return f.id;
  }
  if (type) {
    const f = accounts.find((a) => a.type === type);
    if (f) return f.id;
  }
  return "";
}

/* ============ Invoices Tab ============ */
function useProducts() {
  return useQuery({
    queryKey: ["products", "active"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").eq("is_active", true).eq("is_deleted", false).eq("is_archived", false).order("name");
      return (data ?? []) as Product[];
    },
  });
}

function InvoicesTab({ kind, fmt }: { kind: Kind; fmt: (n: number) => string }) {
  const qc = useQueryClient();
  const isSale = kind === "customer";
  const invType = isSale ? "sale" : "purchase";
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [filter, setFilter] = useState<"all" | "draft" | "posted">("all");
  const [search, setSearch] = useState("");
  const [partnerFilter, setPartnerFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices", invType],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*").eq("type", invType).eq("is_deleted", false).eq("is_archived", false).order("invoice_date", { ascending: false }).order("invoice_no", { ascending: false });
      if (error) throw error;
      return data as Invoice[];
    },
  });

  const { data: partners = [] } = usePartners(kind);
  const partnerMap = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners]);

  const confirm = useConfirm();
  const del = useMutation({
    mutationFn: async (inv: Invoice) => {
      const posted = inv.status === "posted";
      const choice = await confirm({
        title: `حذف الفاتورة #${inv.invoice_no}`,
        description: "لا يمكن التراجع عن هذه العملية.",
        allowReverse: posted,
      });
      if (!choice) return null;
      const snapshot = { invoice_no: inv.invoice_no, total: inv.total, status: inv.status };
      if (choice === "reverse") {
        if (inv.journal_entry_id) await createReversalEntry(inv.journal_entry_id);
        await reverseStockForInvoice(inv.id);
        await archiveRecord("invoices", inv.id, snapshot as never);
        return choice;
      }
      await reverseStockForInvoice(inv.id);
      if (choice === "delete" && inv.journal_entry_id) await unpostJournal(inv.journal_entry_id);
      if (choice === "archive") await archiveRecord("invoices", inv.id, snapshot as never);
      else await softDeleteRecord("invoices", inv.id, snapshot as never);
      return choice;
    },
    onSuccess: (r) => { if (!r) return; qc.invalidateQueries({ queryKey: ["invoices"] }); qc.invalidateQueries({ queryKey: ["journal-entries"] }); qc.invalidateQueries({ queryKey: ["products"] }); toast.success(r === "reverse" ? "تم إنشاء قيد عكسي" : r === "archive" ? "تمت الأرشفة" : "تم الحذف"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    return invoices.filter((i) => {
      if (filter !== "all" && i.status !== filter) return false;
      if (partnerFilter && i.partner_id !== partnerFilter) return false;
      if (fromDate && i.invoice_date < fromDate) return false;
      if (toDate && i.invoice_date > toDate) return false;
      if (search) {
        const q = search.toLowerCase();
        const pname = partnerMap.get(i.partner_id)?.name.toLowerCase() ?? "";
        if (!String(i.invoice_no).includes(q) && !pname.includes(q) && !(i.reference ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [invoices, filter, partnerFilter, fromDate, toDate, search, partnerMap]);

  const totals = useMemo(() => ({
    all: invoices.reduce((s, i) => s + Number(i.total), 0),
    draft: invoices.filter((i) => i.status === "draft").reduce((s, i) => s + Number(i.total), 0),
    posted: invoices.filter((i) => i.status === "posted").reduce((s, i) => s + Number(i.total), 0),
  }), [invoices]);

  const exportList = async (fmt2: "excel" | "pdf") => {
    const headers = ["#", "التاريخ", "الاستحقاق", isSale ? "العميل" : "المورد", "المرجع", "الإجمالي", "الحالة"];
    const rows = filtered.map((i) => [String(i.invoice_no), i.invoice_date, i.due_date ?? "—", partnerMap.get(i.partner_id)?.name ?? "—", i.reference ?? "", Number(i.total), i.status === "posted" ? "مُرحّل" : i.status === "draft" ? "مسودة" : "ملغى"]);
    const totalsRow = ["", "", "", "", "الإجمالي", filtered.reduce((s, i) => s + Number(i.total), 0), ""];
    const title = isSale ? "فواتير المبيعات" : "فواتير المشتريات";
    if (fmt2 === "excel") exportToExcel(title, title, [{ headers, rows, totals: totalsRow }]);
    else exportToPDF(title, title, [{ headers, rows, totals: totalsRow }]);
  };

  return (
    <div>
      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        <SummaryCard icon={FileText} label="إجمالي الفواتير" value={fmt(totals.all)} hint={`${invoices.length} فاتورة`} tone="primary" />
        <SummaryCard icon={Clock} label="مسودات" value={fmt(totals.draft)} hint={`${invoices.filter((i) => i.status === "draft").length} فاتورة`} tone="warning" />
        <SummaryCard icon={CheckCircle2} label="مُرحّلة" value={fmt(totals.posted)} hint={`${invoices.filter((i) => i.status === "posted").length} فاتورة`} tone="success" />
      </div>

      <div className="bg-card border rounded-lg p-3 mb-3 grid md:grid-cols-4 gap-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute top-2.5 start-2 text-muted-foreground" />
          <input placeholder="بحث برقم / اسم / مرجع" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full ps-8 pe-3 py-2 border rounded-md bg-background text-sm" />
        </div>
        <select value={partnerFilter} onChange={(e) => setPartnerFilter(e.target.value)} className="px-3 py-2 border rounded-md bg-background text-sm">
          <option value="">— كل {isSale ? "العملاء" : "الموردين"} —</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-2 border rounded-md bg-background text-sm" placeholder="من" />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-2 border rounded-md bg-background text-sm" placeholder="إلى" />
      </div>

      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <div className="flex gap-1 bg-muted/50 p-1 rounded-md">
          {(["all", "draft", "posted"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 text-xs font-medium rounded ${filter === f ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
              {f === "all" ? "الكل" : f === "draft" ? "مسودة" : "مُرحّل"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportList("excel")} className="flex items-center gap-1.5 border px-3 py-2 rounded-md text-xs font-medium hover:bg-muted"><Download className="w-3.5 h-3.5" /> Excel</button>
          <button onClick={() => exportList("pdf")} className="flex items-center gap-1.5 border px-3 py-2 rounded-md text-xs font-medium hover:bg-muted"><Printer className="w-3.5 h-3.5" /> PDF</button>
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium">
            <Plus className="w-4 h-4" /> {isSale ? "فاتورة بيع" : "فاتورة شراء"}
          </button>
        </div>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-start px-4 py-3">رقم</th>
              <th className="text-start px-4 py-3">التاريخ</th>
              <th className="text-start px-4 py-3">الاستحقاق</th>
              <th className="text-start px-4 py-3">{isSale ? "العميل" : "المورد"}</th>
              <th className="text-start px-4 py-3">المرجع</th>
              <th className="text-start px-4 py-3 w-28">الإجمالي</th>
              <th className="text-start px-4 py-3 w-24">الحالة</th>
              <th className="w-32"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">لا توجد فواتير</td></tr>}
            {filtered.map((inv) => (
              <tr key={inv.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-2.5 num font-medium">#{inv.invoice_no}</td>
                <td className="px-4 py-2.5 num text-muted-foreground">{inv.invoice_date}</td>
                <td className="px-4 py-2.5 num">
                  {inv.due_date ? (
                    <span className={inv.status === "posted" && inv.due_date < new Date().toISOString().slice(0, 10) ? "text-destructive font-medium" : "text-muted-foreground"}>
                      {inv.due_date}
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2.5">{partnerMap.get(inv.partner_id)?.name ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{inv.reference || "—"}</td>
                <td className="px-4 py-2.5 num font-semibold">{fmt(Number(inv.total))}</td>
                <td className="px-4 py-2.5"><StatusBadge status={inv.status} /></td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1 justify-end">
                    <PrintMenu inv={inv} partnerName={partnerMap.get(inv.partner_id)?.name ?? ""} isSale={isSale} />
                    <button onClick={() => { setEditing(inv); setShowForm(true); }} className="p-1.5 rounded hover:bg-muted" title="تعديل"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => del.mutate(inv)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive" title="حذف"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <InvoiceForm
          kind={kind}
          invoice={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["invoices"] });
            qc.invalidateQueries({ queryKey: ["journal-entries"] });
            qc.invalidateQueries({ queryKey: ["products"] });
            setShowForm(false); setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function PrintMenu({ inv, partnerName, isSale }: { inv: Invoice; partnerName: string; isSale: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  if (!isSale) {
    return (
      <button onClick={() => printInvoiceA4(inv, partnerName)} className="p-1.5 rounded hover:bg-muted" title="طباعة">
        <Printer className="w-3.5 h-3.5" />
      </button>
    );
  }
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen((v) => !v)} className="p-1.5 rounded hover:bg-muted flex items-center gap-0.5" title="طباعة">
        <Printer className="w-3.5 h-3.5" /><ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute end-0 top-full mt-1 bg-popover border rounded-md shadow-lg z-30 py-1 min-w-[180px]">
          <button onClick={() => { setOpen(false); printInvoiceA4(inv, partnerName); }} className="w-full text-start px-3 py-2 text-sm hover:bg-muted flex items-center gap-2">
            <FileText className="w-3.5 h-3.5" /> فاتورة A4 (PDF)
          </button>
          <button onClick={() => { setOpen(false); printInvoiceReceipt(inv, partnerName); }} className="w-full text-start px-3 py-2 text-sm hover:bg-muted flex items-center gap-2">
            <Receipt className="w-3.5 h-3.5" /> إيصال 80mm (طابعة صغيرة)
          </button>
        </div>
      )}
    </div>
  );
}

async function printInvoiceA4(inv: Invoice, partnerName: string) {
  const [{ data: lines }, brand] = await Promise.all([
    supabase.from("invoice_lines").select("*").eq("invoice_id", inv.id).order("line_order"),
    fetchCompanyBrand(),
  ]);
  const rows = (lines ?? []).map((l: any) => [l.description || "—", Number(l.quantity), Number(l.unit_price), Number(l.total)]);
  const net = Number(inv.subtotal) - Number(inv.discount_amount || 0);
  exportToPDF(
    `Invoice-${inv.invoice_no}`,
    `${inv.type === "sale" ? "فاتورة مبيعات" : "فاتورة مشتريات"} #${inv.invoice_no}`,
    [{
      title: `${inv.type === "sale" ? "العميل" : "المورد"}: ${partnerName} · التاريخ: ${inv.invoice_date}`,
      headers: ["الصنف", "الكمية", "سعر الوحدة", "الإجمالي"],
      rows,
      totals: ["", "", "الإجمالي قبل الخصم", Number(inv.subtotal)],
    }, {
      headers: ["البيان", "القيمة"],
      rows: [
        ["الخصم", Number(inv.discount_amount || 0)],
        ["الصافي", net],
        ["الضريبة", Number(inv.tax)],
      ],
      totals: ["الإجمالي النهائي", Number(inv.total)],
    }],
    { subtitle: inv.reference ? `مرجع: ${inv.reference}` : undefined, date: inv.invoice_date, brand: brand ?? undefined },
  );
}

async function printInvoiceReceipt(inv: Invoice, partnerName: string) {
  const [{ data: lines }, brand] = await Promise.all([
    supabase.from("invoice_lines").select("*").eq("invoice_id", inv.id).order("line_order"),
    fetchCompanyBrand(),
  ]);
  const receiptLines = (lines ?? []).map((l: any) => ({
    name: l.description || "—",
    qty: Number(l.quantity),
    price: Number(l.unit_price),
    total: Number(l.total),
  }));
  await exportReceiptPDF(
    inv.type === "sale" ? "فاتورة مبيعات" : "فاتورة مشتريات",
    {
      invoiceNo: inv.invoice_no,
      date: inv.invoice_date,
      partnerName,
      reference: inv.reference,
      lines: receiptLines,
      subtotal: Number(inv.subtotal),
      discount: Number(inv.discount_amount || 0),
      tax: Number(inv.tax || 0),
      total: Number(inv.total),
      notes: inv.notes,
    },
    brand ?? undefined,
  );
}


function InvoiceForm({ kind, invoice, onClose, onSaved }: { kind: Kind; invoice: Invoice | null; onClose: () => void; onSaved: () => void }) {
  const isSale = kind === "customer";
  const { data: partners = [] } = usePartners(kind);
  const { data: accounts = [] } = useAccounts();
  const { data: products = [] } = useProducts();

  const defaultPartnerAcc = useMemo(() => pickDefault(accounts, isSale ? ["111"] : ["211"], isSale ? "asset" : "liability"), [accounts, isSale]);
  const defaultCounterAcc = useMemo(() => pickDefault(accounts, isSale ? ["1020"] : ["213"], isSale ? "revenue" : "expense"), [accounts, isSale]);
  const defaultDiscountAcc = useMemo(() => pickDefault(accounts, ["1203"], "expense"), [accounts]);
  const defaultCogsAcc = useMemo(() => pickDefault(accounts, ["54"], "expense"), [accounts]);
  const defaultInvAcc = useMemo(() => pickDefault(accounts, ["113", "1330"], "asset"), [accounts]);

  const [form, setForm] = useState({
    partner_id: invoice?.partner_id ?? "",
    invoice_date: invoice?.invoice_date ?? new Date().toISOString().slice(0, 10),
    due_date: invoice?.due_date ?? "",
    reference: invoice?.reference ?? "",
    notes: invoice?.notes ?? "",
    tax: invoice?.tax ?? 0,
    discount_type: (invoice?.discount_type ?? "amount") as "amount" | "percent",
    discount_value: invoice?.discount_value ?? 0,
    partner_account_id: invoice?.partner_account_id ?? "",
    counter_account_id: invoice?.counter_account_id ?? "",
    tax_account_id: invoice?.tax_account_id ?? "",
    discount_account_id: invoice?.discount_account_id ?? "",
    cogs_account_id: invoice?.cogs_account_id ?? "",
    inventory_account_id: invoice?.inventory_account_id ?? "",
  });
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [postNow, setPostNow] = useState(invoice ? invoice.status === "posted" : true);

  // Load lines when editing
  useEffect(() => {
    if (!invoice) { setLines([{ product_id: null, description: "", quantity: 1, unit_price: 0, total: 0, cost_per_unit: 0, line_order: 0 }]); return; }
    (async () => {
      const { data } = await supabase.from("invoice_lines").select("*").eq("invoice_id", invoice.id).order("line_order");
      const mapped: Line[] = (data ?? []).map((l: any, i: number) => ({
        id: l.id, product_id: l.product_id ?? null, description: l.description ?? "",
        quantity: Number(l.quantity), unit_price: Number(l.unit_price), total: Number(l.total),
        cost_per_unit: Number(l.cost_per_unit ?? 0), line_order: l.line_order ?? i,
      }));
      setLines(mapped.length ? mapped : [{ product_id: null, description: "", quantity: 1, unit_price: 0, total: 0, cost_per_unit: 0, line_order: 0 }]);
    })();
  }, [invoice]);

  useEffect(() => {
    setForm((f) => ({
      ...f,
      partner_account_id: f.partner_account_id || defaultPartnerAcc,
      counter_account_id: f.counter_account_id || defaultCounterAcc,
      discount_account_id: f.discount_account_id || defaultDiscountAcc,
      cogs_account_id: f.cogs_account_id || defaultCogsAcc,
      inventory_account_id: f.inventory_account_id || defaultInvAcc,
    }));
  }, [defaultPartnerAcc, defaultCounterAcc, defaultDiscountAcc, defaultCogsAcc, defaultInvAcc]);

  const subtotal = useMemo(() => lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price), 0), [lines]);
  const discountAmount = useMemo(() => {
    const v = Number(form.discount_value) || 0;
    if (form.discount_type === "percent") return Math.min(subtotal, (subtotal * v) / 100);
    return Math.min(subtotal, v);
  }, [form.discount_type, form.discount_value, subtotal]);
  const net = subtotal - discountAmount;
  const total = net + Number(form.tax || 0);

  const updateLine = (idx: number, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, ...patch };
      next.total = Number(next.quantity) * Number(next.unit_price);
      return next;
    }));
  };
  const addLine = () => setLines((p) => [...p, { product_id: null, description: "", quantity: 1, unit_price: 0, total: 0, cost_per_unit: 0, line_order: p.length }]);
  const removeLine = (idx: number) => setLines((p) => p.filter((_, i) => i !== idx));

  const pickProduct = (idx: number, pid: string) => {
    const p = products.find((x) => x.id === pid);
    if (!p) { updateLine(idx, { product_id: null }); return; }
    updateLine(idx, {
      product_id: p.id,
      description: p.name,
      unit_price: isSale ? Number(p.sale_price) : Number(p.cost_price),
      cost_per_unit: Number(p.cost_price),
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.partner_id) return toast.error("اختر الطرف");
    const valid = lines.filter((l) => Number(l.quantity) > 0 && Number(l.unit_price) >= 0 && (l.product_id || l.description));
    if (valid.length === 0) return toast.error("أضف سطر واحد على الأقل");

    // Stock check for sales
    if (isSale) {
      // aggregate needed per product
      const needed = new Map<string, number>();
      for (const l of valid) {
        if (!l.product_id) continue;
        needed.set(l.product_id, (needed.get(l.product_id) ?? 0) + Number(l.quantity));
      }
      // If editing, add back previously subtracted qty
      if (invoice) {
        const { data: prev } = await supabase.from("stock_moves").select("product_id, qty").eq("invoice_id", invoice.id);
        for (const m of prev ?? []) {
          // prev sale moves are negative; subtracting a negative = adds back to available
          needed.set(m.product_id, (needed.get(m.product_id) ?? 0) + Number(m.qty));
        }
      }
      for (const [pid, qty] of needed) {
        const p = products.find((x) => x.id === pid);
        if (!p || !p.tracks_inventory) continue;
        if (Number(p.stock_qty) < qty) {
          return toast.error(`الكمية المطلوبة من "${p.name}" (${qty}) أكبر من المتاح (${p.stock_qty})`);
        }
      }
    }

    setSaving(true);
    try {
      // Reverse previous state if editing
      if (invoice) {
        await reverseStockForInvoice(invoice.id);
        if (invoice.journal_entry_id) await unpostJournal(invoice.journal_entry_id);
      }

      const payload = {
        type: (isSale ? "sale" : "purchase") as "sale" | "purchase",
        partner_id: form.partner_id,
        invoice_date: form.invoice_date,
        due_date: form.due_date || null,
        reference: form.reference || null,
        notes: form.notes || null,
        subtotal,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value) || 0,
        discount_amount: discountAmount,
        tax: Number(form.tax) || 0,
        total,
        partner_account_id: form.partner_account_id || null,
        counter_account_id: form.counter_account_id || null,
        tax_account_id: Number(form.tax) > 0 ? form.tax_account_id || null : null,
        discount_account_id: discountAmount > 0 ? form.discount_account_id || null : null,
        cogs_account_id: isSale ? form.cogs_account_id || null : null,
        inventory_account_id: isSale ? form.inventory_account_id || null : null,
        status: "draft" as const,
        journal_entry_id: null,
      };

      let invId = invoice?.id;
      if (invoice) {
        const { error } = await supabase.from("invoices").update(payload).eq("id", invoice.id);
        if (error) throw error;
        await supabase.from("invoice_lines").delete().eq("invoice_id", invoice.id);
      } else {
        const { data, error } = await supabase.from("invoices").insert(payload).select("id").single();
        if (error) throw error;
        invId = data.id;
      }
      if (!invId) throw new Error("failed to save invoice");

      // Insert lines
      const lineRows = valid.map((l, i) => ({
        invoice_id: invId!,
        line_order: i,
        product_id: l.product_id,
        description: l.description || null,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
        total: Number(l.quantity) * Number(l.unit_price),
        cost_per_unit: Number(l.cost_per_unit || 0),
      }));
      const { error: le } = await supabase.from("invoice_lines").insert(lineRows);
      if (le) throw le;

      // Apply stock moves
      await applyStockForInvoice(invId, form.invoice_date, isSale ? "sale" : "purchase", valid.map((l, i) => ({ ...l, line_order: i })));

      // Post if requested
      if (postNow) {
        const { data: full } = await supabase.from("invoices").select("*").eq("id", invId).single();
        if (full) await postInvoiceToJournal(full as any, valid);
      }
      toast.success(invoice ? "تم الحفظ" : "تم الإنشاء");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg max-w-4xl w-full p-6 max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-lg">{invoice ? `تعديل فاتورة #${invoice.invoice_no}` : isSale ? "فاتورة بيع جديدة" : "فاتورة شراء جديدة"}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium block mb-1">{isSale ? "العميل" : "المورد"} *</label>
              <select value={form.partner_id} onChange={(e) => setForm({ ...form, partner_id: e.target.value })} required className="w-full px-3 py-2 border rounded-md bg-background">
                <option value="">— اختر —</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">التاريخ</label>
              <input type="date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} required className="w-full px-3 py-2 border rounded-md bg-background num" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1 flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" strokeWidth={1.75} /> تاريخ الاستحقاق</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} min={form.invoice_date} className="w-full px-3 py-2 border rounded-md bg-background num" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">المرجع</label>
              <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="w-full px-3 py-2 border rounded-md bg-background" />
            </div>
          </div>



          {/* Lines */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/50 px-3 py-2 text-xs font-semibold flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> بنود الفاتورة</span>
              <button type="button" onClick={addLine} className="flex items-center gap-1 text-primary hover:underline"><Plus className="w-3 h-3" /> إضافة سطر</button>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs bg-muted/30">
                <tr>
                  <th className="text-start px-2 py-2 w-56">المنتج</th>
                  <th className="text-start px-2 py-2">الوصف</th>
                  <th className="text-start px-2 py-2 w-20">الكمية</th>
                  <th className="text-start px-2 py-2 w-24">السعر</th>
                  <th className="text-start px-2 py-2 w-28">الإجمالي</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => {
                  const p = l.product_id ? products.find((x) => x.id === l.product_id) : null;
                  const lowStock = isSale && p?.tracks_inventory && Number(p.stock_qty) < Number(l.quantity);
                  return (
                    <tr key={idx} className="border-t">
                      <td className="px-2 py-1.5">
                        <select value={l.product_id ?? ""} onChange={(e) => pickProduct(idx, e.target.value)} className="w-full px-2 py-1.5 border rounded bg-background text-xs">
                          <option value="">— حر —</option>
                          {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.tracks_inventory ? ` (${Number(p.stock_qty)})` : ""}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={l.description} onChange={(e) => updateLine(idx, { description: e.target.value })} className="w-full px-2 py-1.5 border rounded bg-background text-xs" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" step="0.001" value={l.quantity} onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })} className={`w-full px-2 py-1.5 border rounded bg-background text-xs num ${lowStock ? "border-destructive text-destructive" : ""}`} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" step="0.01" value={l.unit_price} onChange={(e) => updateLine(idx, { unit_price: Number(e.target.value) })} className="w-full px-2 py-1.5 border rounded bg-background text-xs num" />
                      </td>
                      <td className="px-2 py-1.5 num font-medium">{(Number(l.quantity) * Number(l.unit_price)).toFixed(2)}</td>
                      <td className="px-2 py-1.5">
                        <button type="button" onClick={() => removeLine(idx)} className="p-1 text-destructive hover:bg-destructive/10 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-medium block">الخصم</label>
              <div className="flex gap-2">
                <select value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value as "amount" | "percent" })} className="px-3 py-2 border rounded-md bg-background text-sm">
                  <option value="amount">مبلغ</option>
                  <option value="percent">نسبة %</option>
                </select>
                <input type="number" step="0.01" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })} className="flex-1 px-3 py-2 border rounded-md bg-background num" />
              </div>
              <label className="text-xs font-medium block mt-2">الضريبة (مبلغ)</label>
              <input type="number" step="0.01" value={form.tax} onChange={(e) => setForm({ ...form, tax: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-md bg-background num" />
            </div>
            <div className="bg-muted/40 rounded-lg p-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">إجمالي قبل الخصم</span><span className="num font-medium">{subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">الخصم</span><span className="num font-medium text-destructive">-{discountAmount.toFixed(2)}</span></div>
              <div className="flex justify-between border-t pt-1.5"><span className="text-muted-foreground">صافي الفاتورة</span><span className="num font-medium">{net.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">الضريبة</span><span className="num font-medium">{Number(form.tax || 0).toFixed(2)}</span></div>
              <div className="flex justify-between border-t pt-2 text-base"><span className="font-semibold">الإجمالي النهائي</span><span className="num font-bold text-primary">{total.toFixed(2)}</span></div>
            </div>
          </div>

          <details className="border rounded-md">
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-muted-foreground bg-muted/30">حسابات الترحيل التلقائي</summary>
            <div className="p-3 grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium block mb-1">حساب {isSale ? "العميل" : "المورد"}</label><AccountSelect accounts={accounts} value={form.partner_account_id} onChange={(v) => setForm({ ...form, partner_account_id: v })} /></div>
              <div><label className="text-xs font-medium block mb-1">حساب {isSale ? "المبيعات" : "المشتريات"}</label><AccountSelect accounts={accounts} value={form.counter_account_id} onChange={(v) => setForm({ ...form, counter_account_id: v })} /></div>
              {discountAmount > 0 && <div><label className="text-xs font-medium block mb-1">حساب الخصم</label><AccountSelect accounts={accounts} value={form.discount_account_id} onChange={(v) => setForm({ ...form, discount_account_id: v })} /></div>}
              {Number(form.tax) > 0 && <div><label className="text-xs font-medium block mb-1">حساب الضريبة</label><AccountSelect accounts={accounts} value={form.tax_account_id} onChange={(v) => setForm({ ...form, tax_account_id: v })} /></div>}
              {isSale && (
                <>
                  <div><label className="text-xs font-medium block mb-1">حساب تكلفة البضاعة المباعة</label><AccountSelect accounts={accounts} value={form.cogs_account_id} onChange={(v) => setForm({ ...form, cogs_account_id: v })} /></div>
                  <div><label className="text-xs font-medium block mb-1">حساب المخزون</label><AccountSelect accounts={accounts} value={form.inventory_account_id} onChange={(v) => setForm({ ...form, inventory_account_id: v })} /></div>
                </>
              )}
            </div>
          </details>

          <div>
            <label className="text-xs font-medium block mb-1">ملاحظات</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-3 py-2 border rounded-md bg-background" />
          </div>

          <label className="flex items-center gap-2 text-sm bg-primary/5 border border-primary/20 rounded-md p-3">
            <input type="checkbox" checked={postNow} onChange={(e) => setPostNow(e.target.checked)} />
            <span>ترحيل الفاتورة تلقائياً إلى قيد يومية{isSale ? " + قيد تكلفة البضاعة" : ""}</span>
          </label>

          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold">{saving ? "..." : "حفظ"}</button>
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-md text-sm">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
}



function AccountSelect({ accounts, value, onChange }: { accounts: Account[]; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-background">
      <option value="">— اختر —</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
      ))}
    </select>
  );
}

/* ============ Payments Tab ============ */
function PaymentsTab({ kind, fmt }: { kind: Kind; fmt: (n: number) => string }) {
  const qc = useQueryClient();
  const isReceipt = kind === "customer";
  const payKind = isReceipt ? "receipt" : "payment";
  const [showForm, setShowForm] = useState(false);

  const { data: payments = [] } = useQuery({
    queryKey: ["payments", payKind],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("*").eq("kind", payKind).eq("is_deleted", false).eq("is_archived", false).order("payment_date", { ascending: false });
      if (error) throw error;
      return data as Payment[];
    },
  });

  const { data: partners = [] } = usePartners(kind);
  const partnerMap = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners]);

  const confirm = useConfirm();
  const del = useMutation({
    mutationFn: async (p: Payment) => {
      const posted = !!p.journal_entry_id;
      const choice = await confirm({
        title: "حذف السند",
        description: "لا يمكن التراجع عن هذه العملية.",
        allowReverse: posted,
      });
      if (!choice) return null;
      if (choice === "reverse") {
        if (p.journal_entry_id) await createReversalEntry(p.journal_entry_id);
        await archiveRecord("payments", p.id);
        return choice;
      }
      if (choice === "delete" && p.journal_entry_id) await unpostJournal(p.journal_entry_id);
      if (choice === "archive") await archiveRecord("payments", p.id);
      else await softDeleteRecord("payments", p.id);
      return choice;
    },
    onSuccess: (r) => { if (!r) return; qc.invalidateQueries({ queryKey: ["payments"] }); qc.invalidateQueries({ queryKey: ["journal-entries"] }); toast.success(r === "reverse" ? "تم إنشاء قيد عكسي" : r === "archive" ? "تمت الأرشفة" : "تم الحذف"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = payments.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-3 mb-5">
        <SummaryCard icon={Receipt} label={isReceipt ? "إجمالي المقبوضات" : "إجمالي المدفوعات"} value={fmt(total)} hint={`${payments.length} عملية`} tone="primary" />
        <SummaryCard icon={CheckCircle2} label="مُرحّلة في اليومية" value={fmt(payments.filter((p) => p.journal_entry_id).reduce((s, p) => s + Number(p.amount), 0))} hint={`${payments.filter((p) => p.journal_entry_id).length} عملية`} tone="success" />
      </div>

      <div className="flex justify-between items-center mb-3">
        <p className="text-sm text-muted-foreground">{payments.length} {isReceipt ? "إيصال قبض" : "إذن صرف"}</p>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium">
          <Plus className="w-4 h-4" /> {isReceipt ? "إيصال قبض" : "إذن صرف"}
        </button>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-start px-4 py-3">رقم</th>
              <th className="text-start px-4 py-3">التاريخ</th>
              <th className="text-start px-4 py-3">{isReceipt ? "العميل" : "المورد"}</th>
              <th className="text-start px-4 py-3">الطريقة</th>
              <th className="text-start px-4 py-3">المرجع</th>
              <th className="text-start px-4 py-3 w-28">المبلغ</th>
              <th className="text-start px-4 py-3 w-24">الحالة</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">لا توجد دفعات</td></tr>}
            {payments.map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-2.5 num font-medium">#{p.payment_no}</td>
                <td className="px-4 py-2.5 num text-muted-foreground">{p.payment_date}</td>
                <td className="px-4 py-2.5">{partnerMap.get(p.partner_id)?.name ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{p.method || "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{p.reference || "—"}</td>
                <td className="px-4 py-2.5 num font-semibold">{fmt(Number(p.amount))}</td>
                <td className="px-4 py-2.5">{p.journal_entry_id ? <StatusBadge status="posted" /> : <StatusBadge status="draft" />}</td>
                <td className="px-4 py-2.5">
                  <button onClick={() => del.mutate(p)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <PaymentForm
          kind={kind}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["payments"] });
            qc.invalidateQueries({ queryKey: ["invoices"] });
            qc.invalidateQueries({ queryKey: ["journal-entries"] });
            setShowForm(false);
          }}
        />
      )}
    </div>
  );
}

function PaymentForm({ kind, onClose, onSaved }: { kind: Kind; onClose: () => void; onSaved: () => void }) {
  const isReceipt = kind === "customer";
  const { data: partners = [] } = usePartners(kind);
  const { data: accounts = [] } = useAccounts();
  const invType = isReceipt ? "sale" : "purchase";

  const [partnerId, setPartnerId] = useState("");
  const { data: openInvoices = [] } = useQuery({
    queryKey: ["invoices-open", invType, partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data } = await supabase.from("invoices").select("id, invoice_no, invoice_date, total")
        .eq("type", invType).eq("partner_id", partnerId).eq("status", "posted").order("invoice_date", { ascending: false });
      return (data ?? []) as Array<{ id: string; invoice_no: number; invoice_date: string; total: number }>;
    },
  });

  const defaultCash = useMemo(() => pickDefault(accounts, ["1001", "1000"], "asset"), [accounts]);
  const defaultPartnerAcc = useMemo(() => pickDefault(accounts, isReceipt ? ["111"] : ["211"], isReceipt ? "asset" : "liability"), [accounts, isReceipt]);

  const [form, setForm] = useState({
    payment_date: new Date().toISOString().slice(0, 10),
    invoice_id: "",
    amount: 0,
    method: "نقدي",
    reference: "",
    notes: "",
    cash_account_id: "",
    partner_account_id: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm((f) => ({
      ...f,
      cash_account_id: f.cash_account_id || defaultCash,
      partner_account_id: f.partner_account_id || defaultPartnerAcc,
    }));
  }, [defaultCash, defaultPartnerAcc]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerId) return toast.error("اختر الطرف");
    if (Number(form.amount) <= 0) return toast.error("أدخل المبلغ");
    if (!form.cash_account_id || !form.partner_account_id) return toast.error("اختر الحسابات");
    setSaving(true);
    try {
      const { data: inserted, error } = await supabase.from("payments").insert({
        kind: isReceipt ? "receipt" : "payment",
        partner_id: partnerId,
        invoice_id: form.invoice_id || null,
        payment_date: form.payment_date,
        amount: Number(form.amount),
        method: form.method || null,
        reference: form.reference || null,
        notes: form.notes || null,
        cash_account_id: form.cash_account_id,
        partner_account_id: form.partner_account_id,
        status: "draft",
      }).select("*").single();
      if (error) throw error;
      await postPaymentToJournal(inserted as Payment);
      toast.success("تم تسجيل الدفعة وترحيلها");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-lg">{isReceipt ? "إيصال قبض" : "إذن صرف"}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1">{isReceipt ? "العميل" : "المورد"} *</label>
              <select value={partnerId} onChange={(e) => { setPartnerId(e.target.value); setForm({ ...form, invoice_id: "" }); }} required className="w-full px-3 py-2 border rounded-md bg-background">
                <option value="">— اختر —</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">التاريخ</label>
              <input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} required className="w-full px-3 py-2 border rounded-md bg-background" />
            </div>
          </div>

          {partnerId && openInvoices.length > 0 && (
            <div>
              <label className="text-xs font-medium block mb-1">سداد على فاتورة (اختياري)</label>
              <select value={form.invoice_id} onChange={(e) => {
                const inv = openInvoices.find((i) => i.id === e.target.value);
                setForm({ ...form, invoice_id: e.target.value, amount: inv ? Number(inv.total) : form.amount });
              }} className="w-full px-3 py-2 border rounded-md bg-background">
                <option value="">— بدون ربط —</option>
                {openInvoices.map((i) => <option key={i.id} value={i.id}>#{i.invoice_no} · {i.invoice_date} · {Number(i.total).toFixed(2)}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1">المبلغ *</label>
              <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} required className="w-full px-3 py-2 border rounded-md bg-background num" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">طريقة الدفع</label>
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="w-full px-3 py-2 border rounded-md bg-background">
                <option value="نقدي">نقدي</option>
                <option value="تحويل بنكي">تحويل بنكي</option>
                <option value="شيك">شيك</option>
                <option value="بطاقة">بطاقة</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1">حساب الصندوق/البنك ({isReceipt ? "مدين" : "دائن"})</label>
              <AccountSelect accounts={accounts} value={form.cash_account_id} onChange={(v) => setForm({ ...form, cash_account_id: v })} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">حساب {isReceipt ? "العميل (دائن)" : "المورد (مدين)"}</label>
              <AccountSelect accounts={accounts} value={form.partner_account_id} onChange={(v) => setForm({ ...form, partner_account_id: v })} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium block mb-1">المرجع / ملاحظات</label>
            <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="w-full px-3 py-2 border rounded-md bg-background" />
          </div>

          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-md p-3 text-xs text-emerald-700 dark:text-emerald-400">
            ستتم إضافة قيد يومية تلقائياً عند الحفظ.
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="flex-1 bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium">{saving ? "..." : "حفظ وترحيل"}</button>
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-md text-sm">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============ UI helpers ============ */
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    posted: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    cancelled: "bg-muted text-muted-foreground border-border",
  };
  const labels: Record<string, string> = { draft: "مسودة", posted: "مُرحّل", cancelled: "ملغى" };
  return <span className={`text-xs px-2 py-0.5 rounded border ${styles[status] ?? ""}`}>{labels[status] ?? status}</span>;
}

function SummaryCard({ icon: Icon, label, value, hint, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint: string; tone: "primary" | "success" | "warning" }) {
  const toneCls = {
    primary: "from-primary/10 to-primary/5 text-primary border-primary/20",
    success: "from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    warning: "from-amber-500/10 to-amber-500/5 text-amber-600 dark:text-amber-400 border-amber-500/20",
  }[tone];
  return (
    <div className={`bg-gradient-to-br ${toneCls} border rounded-xl p-4`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-foreground/70">{label}</span>
        <Icon className="w-4 h-4 opacity-70" />
      </div>
      <div className="text-2xl font-bold num text-foreground">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>
    </div>
  );
}
