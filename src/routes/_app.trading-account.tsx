import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel, exportToPDF, type Section as ExSection } from "@/lib/export-utils";
import { useI18n } from "@/lib/i18n";
import { ReportShell } from "@/components/report-shell";

export const Route = createFileRoute("/_app/trading-account")({ component: TradingAccountPage });

type AccountRow = { id: string; code: string; name: string; type: string };

const STORAGE_KEY = "trading-account:mapping";

type Bucket =
  | "sales"
  | "sales_returns"
  | "purchases"
  | "purchase_returns"
  | "opening_inventory"
  | "closing_inventory";

type Mapping = Record<Bucket, string[]>;

const KEYWORDS: Record<Bucket, string[]> = {
  sales: ["مبيعات", "sales"],
  sales_returns: ["مردودات المبيعات", "مردود المبيعات", "sales return"],
  purchases: ["مشتريات", "purchases"],
  purchase_returns: ["مردودات المشتريات", "مردود المشتريات", "purchase return"],
  opening_inventory: ["مخزون أول", "بضاعة أول", "opening inventory", "opening stock"],
  closing_inventory: ["مخزون آخر", "بضاعة آخر", "closing inventory", "closing stock"],
};

function autoDetect(accounts: AccountRow[]): Mapping {
  const m: Mapping = {
    sales: [], sales_returns: [], purchases: [], purchase_returns: [],
    opening_inventory: [], closing_inventory: [],
  };
  for (const a of accounts) {
    const name = a.name.toLowerCase();
    // Sales returns must check before sales (more specific)
    const buckets: Bucket[] = [
      "sales_returns", "purchase_returns", "sales", "purchases",
      "opening_inventory", "closing_inventory",
    ];
    for (const b of buckets) {
      if (KEYWORDS[b].some((kw) => name.includes(kw.toLowerCase()))) {
        m[b].push(a.id);
        break;
      }
    }
  }
  return m;
}

function loadMapping(): Mapping | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function TradingAccountPage() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [showConfig, setShowConfig] = useState(false);
  const [override, setOverride] = useState<Mapping | null>(() => loadMapping());

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts-trading"],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("id, code, name, type").order("code");
      return (data ?? []) as AccountRow[];
    },
  });

  const { data: balances = new Map<string, number>() } = useQuery({
    queryKey: ["trading-balances", from, to],
    queryFn: async () => {
      let q = supabase
        .from("journal_lines")
        .select("account_id, debit, credit, journal_entries!inner(status, entry_date)")
        .eq("journal_entries.status", "posted");
      if (from) q = q.gte("journal_entries.entry_date", from);
      if (to) q = q.lte("journal_entries.entry_date", to);
      const { data } = await q;
      const m = new Map<string, number>();
      (data ?? []).forEach((l: any) => {
        // debit - credit (asset/expense positive); flip for sales/returns below
        m.set(l.account_id, (m.get(l.account_id) ?? 0) + Number(l.debit) - Number(l.credit));
      });
      return m;
    },
  });

  const mapping = useMemo<Mapping>(() => override ?? autoDetect(accounts), [override, accounts]);

  const sumBucket = (b: Bucket, flipSign = false) =>
    mapping[b].reduce((s, id) => {
      const v = balances.get(id) ?? 0;
      return s + (flipSign ? -v : v);
    }, 0);

  // Sales & sales returns are revenue accounts → balance is credit-side, so flip sign.
  const sales = sumBucket("sales", true);
  const salesReturns = sumBucket("sales_returns"); // debit balance natural
  const netSales = sales - salesReturns;

  const purchases = sumBucket("purchases"); // expense, debit balance
  const purchaseReturns = sumBucket("purchase_returns", true); // credit balance
  const netPurchases = purchases - purchaseReturns;

  const openingInv = sumBucket("opening_inventory");
  const closingInv = sumBucket("closing_inventory");

  const cogs = openingInv + netPurchases - closingInv;
  const grossProfit = netSales - cogs;

  const fmt = (n: number) =>
    n.toLocaleString(isAr ? "ar-EG" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const listFor = (b: Bucket, flip = false) =>
    mapping[b].map((id) => {
      const a = accById.get(id);
      const v = balances.get(id) ?? 0;
      return { id, code: a?.code ?? "", name: a?.name ?? "—", amount: flip ? -v : v };
    });

  const T = (ar: string, en: string) => (isAr ? ar : en);
  const title = T("حساب المتاجرة", "Trading Account");

  const exportSections = (): ExSection[] => [
    {
      title: T("المبيعات", "Sales"),
      headers: [T("الكود", "Code"), T("الحساب", "Account"), T("المبلغ", "Amount")],
      rows: listFor("sales", true).map((r) => [r.code, r.name, r.amount]),
      totals: ["", T("إجمالي المبيعات", "Total Sales"), sales],
    },
    {
      title: T("مردودات المبيعات", "Sales Returns"),
      headers: [T("الكود", "Code"), T("الحساب", "Account"), T("المبلغ", "Amount")],
      rows: listFor("sales_returns").map((r) => [r.code, r.name, r.amount]),
      totals: ["", T("صافي المبيعات", "Net Sales"), netSales],
    },
    {
      title: T("المشتريات والمخزون", "Purchases & Inventory"),
      headers: [T("البيان", "Item"), "", T("المبلغ", "Amount")],
      rows: [
        [T("مخزون أول المدة", "Opening Inventory"), "", openingInv],
        [T("المشتريات", "Purchases"), "", purchases],
        [T("مردودات المشتريات", "Purchase Returns"), "", purchaseReturns],
        [T("صافي المشتريات", "Net Purchases"), "", netPurchases],
        [T("مخزون آخر المدة", "Closing Inventory"), "", closingInv],
      ],
      totals: ["", T("تكلفة البضاعة المباعة", "Cost of Goods Sold"), cogs],
    },
    {
      title: T("النتيجة", "Result"),
      headers: [T("البيان", "Item"), "", T("المبلغ", "Amount")],
      rows: [],
      totals: [
        grossProfit >= 0 ? T("مجمل الربح", "Gross Profit") : T("مجمل الخسارة", "Gross Loss"),
        "",
        Math.abs(grossProfit),
      ],
    },
  ];

  const saveMapping = (m: Mapping) => {
    setOverride(m);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
  };
  const resetMapping = () => {
    setOverride(null);
    if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <ReportShell
      title={title}
      subtitle={`${T("من", "From")} ${from || "..."} ${T("إلى", "To")} ${to || "..."}`}
      onExcel={() => exportToExcel("trading-account", title, exportSections())}
      onPdf={() => exportToPDF("trading-account", title, exportSections())}
      filters={
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium block mb-1">{T("من تاريخ", "From")}</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="inp" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">{T("إلى تاريخ", "To")}</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="inp" />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => setShowConfig((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-md hover:bg-muted w-full justify-center"
            >
              <Settings2 className="w-4 h-4" /> {T("تعيين الحسابات", "Map Accounts")}
            </button>
          </div>
        </div>
      }
    >
      {showConfig && (
        <MappingPanel
          accounts={accounts}
          mapping={mapping}
          onSave={saveMapping}
          onReset={resetMapping}
          onClose={() => setShowConfig(false)}
          isAr={isAr}
        />
      )}

      <SectionCard title={T("المبيعات", "Sales")}>
        <LineTable
          rows={listFor("sales", true)}
          totalLabel={T("إجمالي المبيعات", "Total Sales")}
          total={sales}
          empty={T("لا توجد حسابات مبيعات", "No sales accounts")}
          fmt={fmt}
          isAr={isAr}
        />
        <LineTable
          rows={listFor("sales_returns")}
          totalLabel={T("مردودات المبيعات", "Sales Returns")}
          total={salesReturns}
          empty=""
          fmt={fmt}
          isAr={isAr}
          hideIfEmpty
        />
        <SummaryRow label={T("صافي المبيعات", "Net Sales")} value={netSales} fmt={fmt} accent />
      </SectionCard>

      <SectionCard title={T("تكلفة البضاعة المباعة", "Cost of Goods Sold")}>
        <SummaryRow label={T("مخزون أول المدة", "Opening Inventory")} value={openingInv} fmt={fmt} />
        <LineTable
          rows={listFor("purchases")}
          totalLabel={T("إجمالي المشتريات", "Total Purchases")}
          total={purchases}
          empty={T("لا توجد حسابات مشتريات", "No purchase accounts")}
          fmt={fmt}
          isAr={isAr}
        />
        <LineTable
          rows={listFor("purchase_returns", true)}
          totalLabel={T("مردودات المشتريات", "Purchase Returns")}
          total={purchaseReturns}
          empty=""
          fmt={fmt}
          isAr={isAr}
          hideIfEmpty
        />
        <SummaryRow label={T("صافي المشتريات", "Net Purchases")} value={netPurchases} fmt={fmt} />
        <SummaryRow label={T("(−) مخزون آخر المدة", "(−) Closing Inventory")} value={closingInv} fmt={fmt} />
        <SummaryRow label={T("تكلفة البضاعة المباعة", "Cost of Goods Sold")} value={cogs} fmt={fmt} accent />
      </SectionCard>

      <div
        className={`bg-card border-2 rounded-lg p-4 md:p-5 mt-6 flex items-center justify-between gap-3 ${
          grossProfit >= 0 ? "border-emerald-500/40" : "border-red-500/40"
        }`}
      >
        <div className="font-bold text-sm md:text-lg min-w-0">
          {grossProfit >= 0 ? T("مجمل الربح", "Gross Profit") : T("مجمل الخسارة", "Gross Loss")}
        </div>
        <div className={`text-lg md:text-2xl font-bold num whitespace-nowrap ${grossProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
          {fmt(Math.abs(grossProfit))}
        </div>
      </div>
    </ReportShell>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border rounded-lg overflow-hidden mb-4">
      <div className="bg-muted/50 px-3 md:px-4 py-2.5 text-[13px] md:text-base font-semibold border-b">{title}</div>
      <div className="divide-y">{children}</div>
    </div>
  );
}

function LineTable({
  rows, totalLabel, total, empty, fmt, isAr, hideIfEmpty,
}: {
  rows: { id: string; code: string; name: string; amount: number }[];
  totalLabel: string; total: number; empty: string; fmt: (n: number) => string; isAr: boolean; hideIfEmpty?: boolean;
}) {
  if (hideIfEmpty && rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
    <table className="w-full text-[12px] md:text-sm">
      <tbody>
        {rows.length === 0 && (
          <tr><td className="text-center py-4 text-muted-foreground text-xs">{empty}</td></tr>
        )}
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="px-2 md:px-4 py-1.5 num w-14 md:w-24 text-[10px] md:text-inherit text-muted-foreground">{r.code}</td>
            <td className="px-2 md:px-4 py-1.5">{r.name}</td>
            <td className="px-2 md:px-4 py-1.5 num w-24 md:w-40 text-end whitespace-nowrap">{fmt(r.amount)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot className="bg-muted/30">
        <tr>
          <td colSpan={2} className="px-2 md:px-4 py-2 font-medium">{totalLabel}</td>
          <td className="px-2 md:px-4 py-2 num text-end font-semibold whitespace-nowrap">{fmt(total)}</td>
        </tr>
      </tfoot>
    </table>
    </div>
  );
}

function SummaryRow({ label, value, fmt, accent }: { label: string; value: number; fmt: (n: number) => string; accent?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-2 px-3 md:px-4 py-2.5 ${accent ? "bg-primary/5 font-semibold" : ""}`}>
      <div className="text-[12px] md:text-sm min-w-0">{label}</div>
      <div className="num text-[12px] md:text-sm whitespace-nowrap">{fmt(value)}</div>
    </div>
  );
}

function MappingPanel({
  accounts, mapping, onSave, onReset, onClose, isAr,
}: {
  accounts: AccountRow[]; mapping: Mapping;
  onSave: (m: Mapping) => void; onReset: () => void; onClose: () => void; isAr: boolean;
}) {
  const [draft, setDraft] = useState<Mapping>(mapping);
  const T = (ar: string, en: string) => (isAr ? ar : en);

  const labels: Record<Bucket, string> = {
    sales: T("المبيعات", "Sales"),
    sales_returns: T("مردودات المبيعات", "Sales Returns"),
    purchases: T("المشتريات", "Purchases"),
    purchase_returns: T("مردودات المشتريات", "Purchase Returns"),
    opening_inventory: T("مخزون أول المدة", "Opening Inventory"),
    closing_inventory: T("مخزون آخر المدة", "Closing Inventory"),
  };

  const toggle = (b: Bucket, id: string) => {
    setDraft((d) => {
      const has = d[b].includes(id);
      return { ...d, [b]: has ? d[b].filter((x) => x !== id) : [...d[b], id] };
    });
  };

  return (
    <div className="bg-card border rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold">{T("تعيين الحسابات لقائمة المتاجرة", "Map Accounts for Trading Account")}</div>
        <div className="flex gap-2">
          <button onClick={onReset} className="text-xs px-3 py-1.5 border rounded hover:bg-muted">
            {T("تلقائي", "Auto-detect")}
          </button>
          <button onClick={() => { onSave(draft); onClose(); }} className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90">
            {T("حفظ", "Save")}
          </button>
          <button onClick={onClose} className="text-xs px-3 py-1.5 border rounded hover:bg-muted">
            {T("إلغاء", "Cancel")}
          </button>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {(Object.keys(labels) as Bucket[]).map((b) => (
          <div key={b} className="border rounded p-2">
            <div className="text-xs font-semibold mb-1 text-muted-foreground">{labels[b]}</div>
            <div className="max-h-40 overflow-auto space-y-0.5">
              {accounts.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-xs px-1 py-0.5 hover:bg-muted rounded">
                  <input
                    type="checkbox"
                    checked={draft[b].includes(a.id)}
                    onChange={() => toggle(b, a.id)}
                  />
                  <span className="num text-muted-foreground">{a.code}</span>
                  <span>{a.name}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
