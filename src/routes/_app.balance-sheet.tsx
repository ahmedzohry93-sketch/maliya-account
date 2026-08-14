import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel, exportToPDF, type Section } from "@/lib/export-utils";
import { ReportShell, StatementCard, BandRow, LineRow, TotalRow, AccountTreeRows } from "@/components/report-shell";
import { buildAccountTree, pruneEmpty, totalOf, flattenTree, type AccNode, type AccountRow } from "@/lib/account-tree";

export const Route = createFileRoute("/_app/balance-sheet")({ component: BalanceSheetPage });

function BalanceSheetPage() {
  const { data } = useQuery({
    queryKey: ["balance-sheet"],
    queryFn: async () => {
      const { data: accounts } = await supabase
        .from("accounts")
        .select("id, code, name, type, parent_id")
        .order("code");
      const { data: lines } = await supabase
        .from("journal_lines")
        .select("account_id, debit, credit, journal_entries!inner(status)")
        .eq("journal_entries.status", "posted");
      const bal = new Map<string, number>();
      (lines ?? []).forEach((l: any) => {
        bal.set(l.account_id, (bal.get(l.account_id) ?? 0) + Number(l.debit) - Number(l.credit));
      });
      return { accounts: (accounts ?? []) as AccountRow[], bal };
    },
  });

  const accounts = data?.accounts ?? [];
  const bal = data?.bal ?? new Map<string, number>();

  const netIncome = useMemo(() => {
    let n = 0;
    accounts.forEach((a) => {
      const d = bal.get(a.id) ?? 0;
      if (a.type === "revenue") n += -d;
      if (a.type === "expense") n -= d;
    });
    return n;
  }, [accounts, bal]);

  const assets = useMemo(
    () => pruneEmpty(buildAccountTree(accounts.filter((a) => a.type === "asset"), (a) => bal.get(a.id) ?? 0)),
    [accounts, bal],
  );
  const liabs = useMemo(
    () => pruneEmpty(buildAccountTree(accounts.filter((a) => a.type === "liability"), (a) => -(bal.get(a.id) ?? 0))),
    [accounts, bal],
  );
  const equity = useMemo(
    () => pruneEmpty(buildAccountTree(accounts.filter((a) => a.type === "equity"), (a) => -(bal.get(a.id) ?? 0))),
    [accounts, bal],
  );

  const totAssets = totalOf(assets);
  const totLiabs = totalOf(liabs);
  const totEquityWithProfit = totalOf(equity) + netIncome;
  const totLiabEquity = totLiabs + totEquityWithProfit;

  const rowsOf = (nodes: AccNode[]) =>
    flattenTree(nodes).map(({ node, depth }) => [node.code, `${"— ".repeat(depth)}${node.name}`, node.amount]);

  const sections = (): Section[] => {
    const eqRows = rowsOf(equity);
    eqRows.push(["", netIncome >= 0 ? "صافي ربح الفترة" : "صافي خسارة الفترة", netIncome]);
    return [
      { title: "الأصول", headers: ["الكود", "اسم الحساب", "المبلغ"], rows: rowsOf(assets), totals: ["", "إجمالي الأصول", totAssets] },
      { title: "الخصوم", headers: ["الكود", "اسم الحساب", "المبلغ"], rows: rowsOf(liabs), totals: ["", "إجمالي الخصوم", totLiabs] },
      { title: "حقوق الملكية", headers: ["الكود", "اسم الحساب", "المبلغ"], rows: eqRows, totals: ["", "إجمالي حقوق الملكية", totEquityWithProfit] },
      { title: "المجموع", headers: ["البيان", "", "المبلغ"], rows: [["إجمالي الأصول", "", totAssets]], totals: ["إجمالي الخصوم + حقوق الملكية", "", totLiabEquity] },
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
          {assets.length === 0 ? (
            <div className="px-4 py-2 text-[13px] text-muted-foreground">لا توجد بيانات</div>
          ) : (
            <AccountTreeRows nodes={assets} />
          )}
          <TotalRow label="إجمالي الأصول" value={totAssets} strong tone="brand" />
        </StatementCard>

        <StatementCard>
          <BandRow label="الالتزامات" />
          {liabs.length === 0 ? (
            <div className="px-4 py-2 text-[13px] text-muted-foreground">لا توجد بيانات</div>
          ) : (
            <AccountTreeRows nodes={liabs} />
          )}
          <TotalRow label="إجمالي الالتزامات" value={totLiabs} />
          <BandRow label="حقوق الملكية" />
          {equity.length > 0 && <AccountTreeRows nodes={equity} />}
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
