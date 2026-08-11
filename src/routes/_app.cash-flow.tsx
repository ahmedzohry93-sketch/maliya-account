import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel, exportToPDF, type Section } from "@/lib/export-utils";
import { ReportShell, StatementCard, BandRow, LineRow, TotalRow } from "@/components/report-shell";


export const Route = createFileRoute("/_app/cash-flow")({ component: CashFlowPage });

type Acc = { id: string; code: string; name: string; type: string };

const CASH_KEYWORDS = ["نقد", "نقدي", "نقديه", "cash", "بنك", "bank", "صندوق"];

const INVESTING_NAME_RE =
  /ثابت|أصول ثابتة|اصول ثابته|آلات|الات|معدات|أثاث|اثاث|مبان|مباني|عقار|أراض|اراض|سيارات|وسائل نقل|حاسب|أجهزة|اجهزة|برمجيات|تراخيص|شهرة|غير ملموس|مجمع إهلاك|مجمع اهلاك|استثمار|equipment|machine|building|land|vehicle|furniture|computer|software|intangible|goodwill|fixed asset|investment/i;
const FINANCING_NAME_RE =
  /قرض|قروض|رأس المال|راس المال|مسحوبات|جاري الشركاء|أرباح موزعة|توزيعات|احتياطي|loan|capital|dividend|drawing|equity|borrow/i;

function classify(otherAcc: Acc | undefined): "operating" | "investing" | "financing" {
  if (!otherAcc) return "operating";
  const name = otherAcc.name || "";
  const code = otherAcc.code || "";

  // Financing: equity movements, long-term debt (2200 group), loans
  if (otherAcc.type === "equity") return "financing";
  if (/^22/.test(code) || FINANCING_NAME_RE.test(name)) return "financing";

  // Investing: non-current assets (1200 group), fixed/intangible assets,
  // accumulated depreciation, gains/losses on asset disposal
  if (otherAcc.type === "asset" && /^12/.test(code)) return "investing";
  if (/بيع أصول ثابتة|بيع اصول ثابته|disposal of fixed asset/i.test(name)) return "investing";
  if ((otherAcc.type === "asset" || otherAcc.type === "liability") && INVESTING_NAME_RE.test(name)) return "investing";

  return "operating";
}


function CashFlowPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [view, setView] = useState<"report" | "detail">("report");


  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts-list-full"],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("id, code, name, type").eq("is_active", true);
      return (data ?? []) as Acc[];
    },
  });

  const cashAccountIds = useMemo(() => {
    return new Set(
      accounts
        .filter((a) => a.type === "asset" && CASH_KEYWORDS.some((k) => a.name?.toLowerCase().includes(k.toLowerCase())))
        .map((a) => a.id),
    );
  }, [accounts]);

  const { data: rawLines = [] } = useQuery({
    queryKey: ["cashflow-lines", from, to],
    enabled: accounts.length > 0,
    queryFn: async () => {
      let q = supabase
        .from("journal_lines")
        .select("id, entry_id, account_id, debit, credit, journal_entries!inner(id, entry_no, entry_date, status, description)")
        .eq("journal_entries.status", "posted");
      if (from) q = q.gte("journal_entries.entry_date", from);
      if (to) q = q.lte("journal_entries.entry_date", to);
      const { data } = await q;
      return (data ?? []) as any[];
    },
  });

  const accMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const movements = useMemo(() => {
    // Group lines by entry
    const byEntry = new Map<string, any[]>();
    rawLines.forEach((l) => {
      const arr = byEntry.get(l.entry_id) ?? [];
      arr.push(l);
      byEntry.set(l.entry_id, arr);
    });

    const items: {
      date: string;
      entry_no: number;
      description: string;
      inflow: number;
      outflow: number;
      counterpart: string;
      category: "operating" | "investing" | "financing";
    }[] = [];

    for (const lines of byEntry.values()) {
      const cashLines = lines.filter((l) => cashAccountIds.has(l.account_id));
      if (cashLines.length === 0) continue;
      const otherLines = lines.filter((l) => !cashAccountIds.has(l.account_id));

      for (const cl of cashLines) {
        const inflow = Number(cl.debit);
        const outflow = Number(cl.credit);
        // Pick best counterpart (the other line w/ matching opposite side, prefer largest)
        const candidates = otherLines.filter((o) =>
          inflow > 0 ? Number(o.credit) > 0 : Number(o.debit) > 0,
        );
        const counter = (candidates.length ? candidates : otherLines).sort(
          (a, b) => Number(b.debit) + Number(b.credit) - Number(a.debit) - Number(a.credit),
        )[0];
        const otherAcc = counter ? accMap.get(counter.account_id) : undefined;
        items.push({
          date: cl.journal_entries.entry_date,
          entry_no: cl.journal_entries.entry_no,
          description: cl.journal_entries.description || "",
          inflow,
          outflow,
          counterpart: otherAcc ? `${otherAcc.code} ${otherAcc.name}` : "—",
          category: classify(otherAcc),
        });
      }
    }
    return items.sort((a, b) => (a.date > b.date ? 1 : -1));
  }, [rawLines, cashAccountIds, accMap]);

  const byCat = (cat: "operating" | "investing" | "financing") => movements.filter((m) => m.category === cat);
  const sum = (arr: typeof movements) => ({
    inflow: arr.reduce((s, r) => s + r.inflow, 0),
    outflow: arr.reduce((s, r) => s + r.outflow, 0),
    net: arr.reduce((s, r) => s + r.inflow - r.outflow, 0),
  });

  const op = sum(byCat("operating"));
  const inv = sum(byCat("investing"));
  const fin = sum(byCat("financing"));
  const total = sum(movements);

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const sections = (): Section[] => {
    const mkSec = (title: string, cat: "operating" | "investing" | "financing"): Section => {
      const rows = byCat(cat).map((m) => [m.date, `#${m.entry_no}`, m.description, m.counterpart, m.inflow > 0 ? m.inflow : "", m.outflow > 0 ? m.outflow : "", m.inflow - m.outflow]);
      const s = sum(byCat(cat));
      return {
        title,
        headers: ["التاريخ", "رقم القيد", "البيان", "الطرف الآخر", "وارد", "صادر", "الصافي"],
        rows,
        totals: ["", "", "", "الإجمالي", s.inflow, s.outflow, s.net],
      };
    };
    return [
      mkSec("الأنشطة التشغيلية", "operating"),
      mkSec("الأنشطة الاستثمارية", "investing"),
      mkSec("الأنشطة التمويلية", "financing"),
      {
        title: "صافي التغير في النقدية",
        headers: ["النشاط", "وارد", "صادر", "الصافي"],
        rows: [
          ["التشغيلية", op.inflow, op.outflow, op.net],
          ["الاستثمارية", inv.inflow, inv.outflow, inv.net],
          ["التمويلية", fin.inflow, fin.outflow, fin.net],
        ],
        totals: ["صافي التغير في النقدية", total.inflow, total.outflow, total.net],
      },
    ];
  };

  const meta = from || to ? { date: `${from || "..."} → ${to || "..."}` } : undefined;

  return (
    <ReportShell
      title="قائمة التدفقات النقدية"
      subtitle={`من ${from || "..."} إلى ${to || new Date().toISOString().slice(0, 10)} · حسابات نقدية: ${cashAccountIds.size}`}
      view={view}
      onViewChange={setView}
      onExcel={movements.length ? () => exportToExcel("cash-flow", "قائمة التدفقات النقدية", sections(), meta) : undefined}
      onPdf={movements.length ? () => exportToPDF("cash-flow", "قائمة التدفقات النقدية", sections(), meta) : undefined}
      filters={
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium block mb-1">من تاريخ</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="inp" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">إلى تاريخ</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="inp" />
          </div>
        </div>
      }
    >
      {view === "report" ? (
        <StatementCard className="max-w-3xl mx-auto">
          <BandRow label="التدفقات النقدية من الأنشطة التشغيلية" />
          <LineRow label="المقبوضات التشغيلية" value={op.inflow} tone="positive" />
          <LineRow label="المدفوعات التشغيلية" value={-op.outflow} />
          <TotalRow label="صافي التدفقات من التشغيل" value={op.net} tone={op.net >= 0 ? "positive" : "negative"} />

          <BandRow label="التدفقات النقدية من الأنشطة الاستثمارية" />
          <LineRow label="متحصلات استثمارية" value={inv.inflow} tone="positive" />
          <LineRow label="شراء أصول / مدفوعات استثمارية" value={-inv.outflow} />
          <TotalRow label="صافي التدفقات من الاستثمار" value={inv.net} tone={inv.net >= 0 ? "positive" : "negative"} />

          <BandRow label="التدفقات النقدية من الأنشطة التمويلية" />
          <LineRow label="متحصلات تمويلية" value={fin.inflow} tone="positive" />
          <LineRow label="سداد قروض / توزيعات" value={-fin.outflow} />
          <TotalRow label="صافي التدفقات من التمويل" value={fin.net} tone={fin.net >= 0 ? "positive" : "negative"} />

          <TotalRow label="صافي التغير في النقدية" value={total.net} strong tone="brand" />
        </StatementCard>
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-3">
            <SummaryCard label="الأنشطة التشغيلية" net={op.net} />
            <SummaryCard label="الأنشطة الاستثمارية" net={inv.net} />
            <SummaryCard label="الأنشطة التمويلية" net={fin.net} />
          </div>
          <CategoryTable title="الأنشطة التشغيلية" items={byCat("operating")} totals={op} />
          <CategoryTable title="الأنشطة الاستثمارية" items={byCat("investing")} totals={inv} />
          <CategoryTable title="الأنشطة التمويلية" items={byCat("financing")} totals={fin} />
          <div className={`rounded-xl p-4 border-2 ${total.net >= 0 ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"}`}>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div><div className="text-[11px] text-muted-foreground mb-1">إجمالي الوارد</div><div className="text-lg font-bold num text-success">{fmt(total.inflow)}</div></div>
              <div><div className="text-[11px] text-muted-foreground mb-1">إجمالي الصادر</div><div className="text-lg font-bold num text-destructive">{fmt(total.outflow)}</div></div>
              <div><div className="text-[11px] text-muted-foreground mb-1">صافي التغير</div><div className={`text-lg font-bold num ${total.net >= 0 ? "text-success" : "text-destructive"}`}>{fmt(total.net)}</div></div>
            </div>
          </div>
        </>
      )}
    </ReportShell>
  );
}


function SummaryCard({ label, net }: { label: string; net: number }) {
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-2xl font-bold num ${net >= 0 ? "text-emerald-700" : "text-red-700"}`}>{fmt(net)}</div>
    </div>
  );
}

function CategoryTable({ title, items, totals }: { title: string; items: any[]; totals: { inflow: number; outflow: number; net: number } }) {
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="bg-card border rounded-lg overflow-hidden mb-4">
      <div className="bg-muted/50 px-4 py-2.5 font-semibold border-b">{title}</div>
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-xs">
          <tr>
            <th className="text-start px-3 py-2">التاريخ</th>
            <th className="text-start px-3 py-2">رقم القيد</th>
            <th className="text-start px-3 py-2">البيان</th>
            <th className="text-start px-3 py-2">الطرف الآخر</th>
            <th className="text-start px-3 py-2 w-28">وارد</th>
            <th className="text-start px-3 py-2 w-28">صادر</th>
            <th className="text-start px-3 py-2 w-28">الصافي</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-muted-foreground text-xs">لا توجد حركة</td></tr>}
          {items.map((m, i) => (
            <tr key={i} className="border-t">
              <td className="px-3 py-1.5 num">{m.date}</td>
              <td className="px-3 py-1.5 num">#{m.entry_no}</td>
              <td className="px-3 py-1.5">{m.description || "—"}</td>
              <td className="px-3 py-1.5 text-xs text-muted-foreground">{m.counterpart}</td>
              <td className="px-3 py-1.5 num text-emerald-700">{m.inflow > 0 ? fmt(m.inflow) : ""}</td>
              <td className="px-3 py-1.5 num text-red-700">{m.outflow > 0 ? fmt(m.outflow) : ""}</td>
              <td className="px-3 py-1.5 num font-medium">{fmt(m.inflow - m.outflow)}</td>
            </tr>
          ))}
        </tbody>
        {items.length > 0 && (
          <tfoot className="bg-muted/40 font-semibold border-t-2">
            <tr>
              <td colSpan={4} className="px-3 py-2">إجمالي {title}</td>
              <td className="px-3 py-2 num text-emerald-700">{fmt(totals.inflow)}</td>
              <td className="px-3 py-2 num text-red-700">{fmt(totals.outflow)}</td>
              <td className={`px-3 py-2 num ${totals.net >= 0 ? "text-emerald-700" : "text-red-700"}`}>{fmt(totals.net)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
