import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel, exportToPDF, type Section } from "@/lib/export-utils";
import { ReportShell, StatementCard, BandRow, LineRow, TotalRow } from "@/components/report-shell";


export const Route = createFileRoute("/_app/balance-sheet")({ component: BalanceSheetPage });

type Acc = { id: string; code: string; name: string; type: string; parent_id: string | null; balance: number };

function BalanceSheetPage() {
  const { data } = useQuery({
    queryKey: ["balance-sheet"],
    queryFn: async () => {
      const { data: accounts } = await supabase.from("accounts").select("id, code, name, type, parent_id").order("code");
      const { data: lines } = await supabase
        .from("journal_lines")
        .select("account_id, debit, credit, journal_entries!inner(status)")
        .eq("journal_entries.status", "posted");
      const parentIds = new Set((accounts ?? []).map((a) => a.parent_id).filter(Boolean));
      const balByAcc = new Map<string, number>();
      (lines ?? []).forEach((l: any) => {
        balByAcc.set(l.account_id, (balByAcc.get(l.account_id) ?? 0) + Number(l.debit) - Number(l.credit));
      });
      // compute net income from posted revenue/expenses (leaves only)
      let netIncome = 0;
      (accounts ?? []).filter((a) => !parentIds.has(a.id)).forEach((a) => {
        const db = balByAcc.get(a.id) ?? 0;
        if (a.type === "revenue") netIncome += -db;
        if (a.type === "expense") netIncome -= db;
      });
      const rows: Acc[] = (accounts ?? [])
        .filter((a) => !parentIds.has(a.id))
        .filter((a) => ["asset", "liability", "equity"].includes(a.type))
        .map((a) => {
          const db = balByAcc.get(a.id) ?? 0;
          const bal = a.type === "asset" ? db : -db;
          return { ...a, balance: bal };
        })
        .filter((a) => a.balance !== 0);
      return { rows, netIncome };
    },
  });

  const assets = useMemo(() => (data?.rows ?? []).filter((a) => a.type === "asset"), [data]);
  const liabs = useMemo(() => (data?.rows ?? []).filter((a) => a.type === "liability"), [data]);
  const equity = useMemo(() => (data?.rows ?? []).filter((a) => a.type === "equity"), [data]);

  const totAssets = assets.reduce((s, r) => s + r.balance, 0);
  const totLiabs = liabs.reduce((s, r) => s + r.balance, 0);
  const totEquity = equity.reduce((s, r) => s + r.balance, 0);
  const netIncome = data?.netIncome ?? 0;
  const totEquityWithProfit = totEquity + netIncome;
  const totLiabEquity = totLiabs + totEquityWithProfit;

  const sections = (): Section[] => {
    const sec = (title: string, items: Acc[], totalLabel: string, total: number): Section => ({
      title,
      headers: ["الكود", "اسم الحساب", "المبلغ"],
      rows: items.map((r) => [r.code, r.name, r.balance]),
      totals: ["", totalLabel, total],
    });
    const eqRows: (string | number)[][] = equity.map((r) => [r.code, r.name, r.balance]);
    eqRows.push(["", netIncome >= 0 ? "صافي ربح الفترة" : "صافي خسارة الفترة", netIncome]);
    return [
      sec("الأصول", assets, "إجمالي الأصول", totAssets),
      sec("الخصوم", liabs, "إجمالي الخصوم", totLiabs),
      {
        title: "حقوق الملكية",
        headers: ["الكود", "اسم الحساب", "المبلغ"],
        rows: eqRows,
        totals: ["", "إجمالي حقوق الملكية", totEquityWithProfit],
      },
      {
        title: "المجموع",
        headers: ["البيان", "", "المبلغ"],
        rows: [["إجمالي الأصول", "", totAssets]],
        totals: ["إجمالي الخصوم + حقوق الملكية", "", totLiabEquity],
      },
    ];
  };

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const balanced = Math.abs(totAssets - totLiabEquity) < 0.01;

  return (
    <ReportShell
      title="الميزانية العمومية"
      subtitle={`كما في ${new Date().toISOString().slice(0, 10)}`}
      onExcel={() => exportToExcel("balance-sheet", "الميزانية العمومية", sections())}
      onPdf={() => exportToPDF("balance-sheet", "الميزانية العمومية", sections())}
    >
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <StatementCard>
          <BandRow label="الأصول" />
          {assets.length === 0 && <LineRow label="لا توجد بيانات" value="—" muted />}
          {assets.map((r) => (
            <LineRow key={r.id} code={r.code} label={r.name} value={r.balance} />
          ))}
          <TotalRow label="إجمالي الأصول" value={totAssets} strong tone="brand" />
        </StatementCard>

        <StatementCard>
          <BandRow label="الالتزامات وحقوق الملكية" />
          {liabs.map((r) => (
            <LineRow key={r.id} code={r.code} label={r.name} value={r.balance} />
          ))}
          <TotalRow label="إجمالي الالتزامات" value={totLiabs} />
          <BandRow label="حقوق الملكية" />
          {equity.map((r) => (
            <LineRow key={r.id} code={r.code} label={r.name} value={r.balance} />
          ))}
          <LineRow
            label={netIncome >= 0 ? "صافي ربح الفترة" : "صافي خسارة الفترة"}
            value={netIncome}
            tone={netIncome >= 0 ? "positive" : "negative"}
            indent
          />
          <TotalRow label="إجمالي حقوق الملكية" value={totEquityWithProfit} />
          <TotalRow label="إجمالي الالتزامات وحقوق الملكية" value={totLiabEquity} strong tone="brand" />
        </StatementCard>
      </div>

      <div
        className={`rounded-xl p-4 border-2 ${balanced ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"}`}
      >
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">إجمالي الأصول</div>
            <div className="text-lg font-bold num">{fmt(totAssets)}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">إجمالي الالتزامات وحقوق الملكية</div>
            <div className="text-lg font-bold num">{fmt(totLiabEquity)}</div>
          </div>
        </div>
        <div className="text-center mt-2 text-xs font-medium">
          {balanced ? "✓ الميزانية متوازنة" : `⚠ فرق غير متوازن: ${fmt(totAssets - totLiabEquity)}`}
        </div>
      </div>
    </ReportShell>
  );
}

